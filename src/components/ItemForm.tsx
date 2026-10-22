'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Anchor,
  Autocomplete,
  Button,
  Checkbox,
  Divider,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import Link from 'next/link';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, mensagemErro, qs } from '@/lib/api';
import { STATUS, STATUS_LABEL, TIPOS, TIPO_LABEL } from '@/lib/constants';
import type { CampoCustom, Item } from '@/lib/types';
import { FuncionarioSelect } from './FuncionarioSelect';

const MAC_RE = /^([0-9a-f]{2}[:-]?){5}[0-9a-f]{2}$/i;
const IP_RE = /^((25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}|[0-9a-f:.]*:[0-9a-f:.]*)$/i;

const formSchema = z.object({
  numeroPatrimonio: z.string().trim().min(1, 'Obrigatório').max(50),
  tag: z.string().max(100),
  ip: z.string().trim().refine((v) => !v || IP_RE.test(v), 'IP inválido'),
  mac: z.string().trim().refine((v) => !v || MAC_RE.test(v), 'MAC inválido'),
  hostname: z.string().max(255),
  osName: z.string().max(255),
  osFlavor: z.string().max(255),
  osSp: z.string().max(255),
  osFamily: z.string().max(255),
  arch: z.string().max(50),
  tipo: z.enum(TIPOS),
  status: z.enum(STATUS),
  funcionarioId: z.number().nullable(),
  setor: z.string().max(100),
  localizacao: z.string().max(150),
  fabricante: z.string().max(100),
  modelo: z.string().max(150),
  numeroSerie: z.string().max(100),
  dataAquisicao: z.string(),
  notaFiscal: z.string().max(60),
  fornecedor: z.string().max(150),
  observacoes: z.string().max(5000),
  descricao: z.string().max(1000),
  camposCustomizados: z.record(z.string(), z.string().nullable()),
});
export type ItemFormValues = z.infer<typeof formSchema>;

export const VAZIO: ItemFormValues = {
  numeroPatrimonio: '',
  tag: '',
  ip: '',
  mac: '',
  hostname: '',
  osName: '',
  osFlavor: '',
  osSp: '',
  osFamily: '',
  arch: '',
  tipo: 'desktop',
  status: 'em_uso',
  funcionarioId: null,
  setor: '',
  localizacao: '',
  fabricante: '',
  modelo: '',
  numeroSerie: '',
  dataAquisicao: '',
  notaFiscal: '',
  fornecedor: '',
  observacoes: '',
  descricao: '',
  camposCustomizados: {},
};

/** Converte um item da API para valores do formulário. */
export function itemParaForm(i: Partial<Item> & { camposCustomizados?: Record<string, string | null> }): ItemFormValues {
  const out = { ...VAZIO } as Record<string, unknown>;
  for (const k of Object.keys(VAZIO)) {
    const v = (i as Record<string, unknown>)[k];
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out as ItemFormValues;
}

type Opcoes = Record<'setor' | 'tag' | 'localizacao' | 'fornecedor' | 'fabricante', string[]>;

type Props = {
  inicial: ItemFormValues;
  itemId?: number;
  funcionarioNome?: string | null;
  origemMsf?: { hostId: number; workspaceId: number };
  submitLabel?: string;
  onSalvo: (item: { id: number; numeroPatrimonio: string }, valores: ItemFormValues) => void;
  onCancelar?: () => void;
  /** texto extra exibido ao lado dos botões (ex.: "2 de 5") */
  rodape?: React.ReactNode;
};

export function ItemForm({ inicial, itemId, funcionarioNome, origemMsf, submitLabel, onSalvo, onCancelar, rodape }: Props) {
  const qc = useQueryClient();
  const [confirmarDup, setConfirmarDup] = useState(false);
  const { register, control, handleSubmit, watch, setValue, getValues, formState } = useForm<ItemFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: inicial,
  });

  const { data: campos = [] } = useQuery({ queryKey: ['campos', 'ativos'], queryFn: () => api<CampoCustom[]>('/api/campos?ativos=true') });
  const { data: opcoes } = useQuery({ queryKey: ['itens-opcoes'], queryFn: () => api<Opcoes>('/api/itens/opcoes') });

  // verificações em tempo real: patrimônio em uso e host já inventariado
  const [patrimonio, mac, ip, hostname] = watch(['numeroPatrimonio', 'mac', 'ip', 'hostname']);
  const [chave] = useDebouncedValue(`${patrimonio}|${mac}|${ip}|${hostname}`, 400);
  const { data: verif } = useQuery({
    queryKey: ['verificar', chave, itemId],
    queryFn: () => {
      const [p, m, i, h] = chave.split('|');
      return api<{ patrimonioEmUso: boolean; host: { id: number; numeroPatrimonio: string; criterio: string } | null }>(
        `/api/itens/verificar${qs({ patrimonio: p, mac: m, ip: i, hostname: h, ignorarId: itemId })}`,
      );
    },
    enabled: chave !== '|||',
  });

  const onSubmit = handleSubmit(async (v) => {
    const faltando = campos.filter((c) => c.obrigatorio && !v.camposCustomizados[String(c.id)]);
    if (faltando.length) {
      notifications.show({ color: 'red', message: `Preencha: ${faltando.map((c) => c.nome).join(', ')}` });
      return;
    }
    try {
      const payload = {
        ...v,
        ...(origemMsf && !itemId ? { msfHostId: origemMsf.hostId, msfWorkspaceId: origemMsf.workspaceId } : {}),
        ...(itemId ? {} : { confirmarDuplicado: confirmarDup }),
      };
      const salvo = itemId
        ? (await api(`/api/itens/${itemId}`, { method: 'PATCH', json: payload }), { id: itemId, numeroPatrimonio: v.numeroPatrimonio })
        : await api<{ id: number; numeroPatrimonio: string }>('/api/itens', { method: 'POST', json: payload });
      qc.invalidateQueries({ queryKey: ['itens'] });
      qc.invalidateQueries({ queryKey: ['item'] });
      qc.invalidateQueries({ queryKey: ['hosts'] });
      qc.invalidateQueries({ queryKey: ['itens-opcoes'] });
      notifications.show({ color: 'teal', message: itemId ? 'Item atualizado' : `Item ${salvo.numeroPatrimonio} adicionado ao inventário` });
      onSalvo(salvo, v);
    } catch (e) {
      notifications.show({ color: 'red', title: 'Não foi possível salvar', message: mensagemErro(e) });
    }
  });

  const hostDuplicado = verif?.host && verif.host.id !== itemId ? verif.host : null;

  return (
    <form onSubmit={onSubmit}>
      <Stack gap="sm">
        {hostDuplicado && (
          <Alert color="orange" icon={<IconAlertTriangle size={18} />} title="Este host já está no inventário">
            <Text size="sm">
              Patrimônio{' '}
              <Anchor component={Link} href={`/inventario/${hostDuplicado.id}`} target="_blank">
                {hostDuplicado.numeroPatrimonio}
              </Anchor>{' '}
              (match por {hostDuplicado.criterio}).
            </Text>
            {!itemId && (
              <Checkbox mt="xs" label="Cadastrar mesmo assim" checked={confirmarDup} onChange={(e) => setConfirmarDup(e.currentTarget.checked)} />
            )}
          </Alert>
        )}

        <Divider label="Identificação" labelPosition="left" />
        <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
          <TextInput
            label="Nº de patrimônio"
            withAsterisk
            {...register('numeroPatrimonio')}
            error={formState.errors.numeroPatrimonio?.message ?? (verif?.patrimonioEmUso ? 'Patrimônio já cadastrado' : undefined)}
          />
          <Controller
            control={control}
            name="tag"
            render={({ field }) => <Autocomplete label="TAG (filial / cliente / CC)" data={opcoes?.tag ?? []} {...field} />}
          />
          <Controller
            control={control}
            name="tipo"
            render={({ field }) => (
              <Select label="Tipo" withAsterisk allowDeselect={false} data={TIPOS.map((t) => ({ value: t, label: TIPO_LABEL[t] }))} {...field} />
            )}
          />
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <Select label="Status" withAsterisk allowDeselect={false} data={STATUS.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} {...field} />
            )}
          />
        </SimpleGrid>

        <TextInput label="Descrição" placeholder="Ex.: MONITOR LG FLATRON L1918S" {...register('descricao')} error={formState.errors.descricao?.message} />

        <Divider label="Rede / sistema (snapshot do msf, editável)" labelPosition="left" />
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
          <TextInput label="IP" classNames={{ input: 'mono' }} {...register('ip')} error={formState.errors.ip?.message} />
          <TextInput label="MAC" classNames={{ input: 'mono' }} {...register('mac')} error={formState.errors.mac?.message} />
          <TextInput label="Hostname" {...register('hostname')} />
          <TextInput label="Sistema operacional" {...register('osName')} />
          <TextInput label="Variante / versão do SO" {...register('osFlavor')} />
          <TextInput label="Arquitetura" {...register('arch')} />
        </SimpleGrid>

        <Divider label="Responsável e localização" labelPosition="left" />
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <Controller
            control={control}
            name="funcionarioId"
            render={({ field }) => (
              <FuncionarioSelect
                label="Funcionário responsável"
                value={field.value}
                nomeAtual={funcionarioNome}
                onChange={(id, f) => {
                  field.onChange(id);
                  if (f?.setor && !getValues('setor')) setValue('setor', f.setor);
                }}
              />
            )}
          />
          <Controller
            control={control}
            name="setor"
            render={({ field }) => <Autocomplete label="Setor / departamento" data={opcoes?.setor ?? []} {...field} />}
          />
          <Controller
            control={control}
            name="localizacao"
            render={({ field }) => <Autocomplete label="Localização" data={opcoes?.localizacao ?? []} {...field} />}
          />
        </SimpleGrid>

        <Divider label="Aquisição e hardware" labelPosition="left" />
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <Controller
            control={control}
            name="fabricante"
            render={({ field }) => <Autocomplete label="Fabricante" data={opcoes?.fabricante ?? []} {...field} />}
          />
          <TextInput label="Modelo" {...register('modelo')} />
          <TextInput label="Nº de série" {...register('numeroSerie')} />
          <Controller
            control={control}
            name="dataAquisicao"
            render={({ field }) => (
              <DateInput
                label="Data de aquisição"
                valueFormat="DD/MM/YYYY"
                clearable
                value={field.value ? dayjs(field.value).toDate() : null}
                onChange={(d) => field.onChange(d ? dayjs(d).format('YYYY-MM-DD') : '')}
              />
            )}
          />
          <TextInput label="Nota fiscal" {...register('notaFiscal')} />
          <Controller
            control={control}
            name="fornecedor"
            render={({ field }) => <Autocomplete label="Fornecedor" data={opcoes?.fornecedor ?? []} {...field} />}
          />
        </SimpleGrid>

        {campos.length > 0 && (
          <>
            <Divider label="Dados administrativos (campos customizados)" labelPosition="left" />
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              {campos.map((c) => (
                <Controller
                  key={c.id}
                  control={control}
                  name={`camposCustomizados.${c.id}`}
                  render={({ field }) => {
                    const comum = { label: c.nome, withAsterisk: c.obrigatorio };
                    if (c.tipo === 'lista')
                      return <Select {...comum} clearable data={c.opcoes ?? []} value={field.value ?? null} onChange={(v) => field.onChange(v)} />;
                    if (c.tipo === 'numero')
                      return (
                        <NumberInput
                          {...comum}
                          decimalSeparator=","
                          value={field.value ?? ''}
                          onChange={(v) => field.onChange(v === '' ? null : String(v))}
                        />
                      );
                    if (c.tipo === 'data')
                      return (
                        <DateInput
                          {...comum}
                          valueFormat="DD/MM/YYYY"
                          clearable
                          value={field.value ? dayjs(field.value).toDate() : null}
                          onChange={(d) => field.onChange(d ? dayjs(d).format('YYYY-MM-DD') : null)}
                        />
                      );
                    return <TextInput {...comum} value={field.value ?? ''} onChange={(e) => field.onChange(e.currentTarget.value)} />;
                  }}
                />
              ))}
            </SimpleGrid>
          </>
        )}

        <Textarea label="Observações" autosize minRows={2} maxRows={6} {...register('observacoes')} />

        <Group justify="space-between" mt="xs">
          <div>{rodape}</div>
          <Group>
            {onCancelar && (
              <Button variant="default" onClick={onCancelar}>
                Cancelar
              </Button>
            )}
            <Button type="submit" loading={formState.isSubmitting} disabled={!!hostDuplicado && !itemId && !confirmarDup}>
              {submitLabel ?? (itemId ? 'Salvar' : 'Adicionar ao inventário')}
            </Button>
          </Group>
        </Group>
      </Stack>
    </form>
  );
}
