'use client';

import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  MultiSelect,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  TagsInput,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconInfoCircle } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, mensagemErro } from '@/lib/api';
import { STATUS, STATUS_LABEL, TIPOS, TIPO_LABEL } from '@/lib/constants';
import type { Grupo } from '@/lib/types';
import { FuncionarioSelect } from '../FuncionarioSelect';

type Linha = { hostId: number; ip: string; mac: string | null; hostname: string | null; situacao: string };
type Relatorio = {
  simulado: boolean;
  analisados: number;
  criados: (Linha & { patrimonio?: string; tipo: string; itemId?: number })[];
  atualizados: (Linha & { itemId: number; campos: string[] })[];
  ignorados: (Linha & { motivo: string })[];
};

type Props = {
  opened: boolean;
  onClose: () => void;
  workspaces: { id: number; name: string; hosts: number }[];
  workspaceId?: string | null;
  /** quando informado, a importação se limita a estes hosts (seleção na tabela) */
  hostIds?: number[];
};

/**
 * Importação em massa msf → inventário (todos os hosts de um workspace / sub-redes, ou os selecionados).
 * Itens novos recebem patrimônio provisório (PROV-000001…) a ser trocado depois pelo número real.
 */
export function ImportacaoMassaModal({ opened, onClose, workspaces, workspaceId, hostIds }: Props) {
  const qc = useQueryClient();
  const { data: grupos = [] } = useQuery({ queryKey: ['grupos'], queryFn: () => api<Grupo[]>('/api/grupos'), enabled: opened });
  const [op, setOp] = useState({
    workspaceId: workspaceId ?? null,
    subredes: [] as string[],
    situacoes: ['desconhecido'] as string[],
    somenteAtivos: true,
    atualizarExistentes: true,
    inferirTipo: true,
    tipoPadrao: 'outro',
    statusPadrao: 'em_uso',
    prefixoPatrimonio: 'PROV',
    setor: '',
    localizacao: '',
    tag: '',
    funcionarioId: null as number | null,
    grupoId: null as string | null,
  });
  const [rel, setRel] = useState<Relatorio | null>(null);
  const [rodando, setRodando] = useState(false);
  const set = <K extends keyof typeof op>(k: K, v: (typeof op)[K]) => {
    setOp((o) => ({ ...o, [k]: v }));
    setRel(null);
  };

  const executar = async (simular: boolean) => {
    setRodando(true);
    try {
      const r = await api<Relatorio>('/api/msf/importar', {
        method: 'POST',
        json: {
          simular,
          workspaceId: op.workspaceId ? Number(op.workspaceId) : undefined,
          subredes: op.subredes.length ? op.subredes : undefined,
          hostIds: hostIds?.length ? hostIds : undefined,
          situacoes: op.situacoes,
          somenteAtivos: op.somenteAtivos,
          atualizarExistentes: op.atualizarExistentes,
          inferirTipo: op.inferirTipo,
          tipoPadrao: op.tipoPadrao,
          statusPadrao: op.statusPadrao,
          prefixoPatrimonio: op.prefixoPatrimonio,
          setor: op.setor || undefined,
          localizacao: op.localizacao || undefined,
          tag: op.tag || undefined,
          funcionarioId: op.funcionarioId ?? undefined,
          grupoId: op.grupoId ? Number(op.grupoId) : undefined,
        },
      });
      setRel(r);
      if (!simular) {
        notifications.show({ color: 'teal', message: `${r.criados.length} item(ns) criado(s), ${r.atualizados.length} atualizado(s)` });
        ['hosts', 'subredes', 'itens', 'dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      }
    } catch (e) {
      notifications.show({ color: 'red', message: mensagemErro(e) });
    } finally {
      setRodando(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} size="xl" title={hostIds?.length ? `Importar ${hostIds.length} host(s) selecionado(s)` : 'Importação em massa do msf'}>
      <Stack>
        <Alert variant="light" icon={<IconInfoCircle size={18} />}>
          Hosts novos viram itens com <b>patrimônio provisório</b> ({op.prefixoPatrimonio || 'PROV'}-000001…), que aparecem no dashboard como “sem
          patrimônio” até receberem o número definitivo. Hosts marcados como conhecidos/ignorados nunca são importados.
        </Alert>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {!hostIds?.length && (
            <>
              <Select
                label="Workspace"
                placeholder="Todos"
                clearable
                data={workspaces.map((w) => ({ value: String(w.id), label: `${w.name} (${w.hosts})` }))}
                value={op.workspaceId}
                onChange={(v) => set('workspaceId', v)}
              />
              <TagsInput
                label="Sub-redes (CIDR)"
                placeholder="ex.: 10.0.0.0/24 — Enter para adicionar"
                value={op.subredes}
                onChange={(v) => set('subredes', v)}
              />
            </>
          )}
          <MultiSelect
            label="Criar itens para hosts"
            data={[
              { value: 'desconhecido', label: 'Não identificados' },
              { value: 'provavel', label: 'Prováveis (só IP bate)' },
            ]}
            value={op.situacoes}
            onChange={(v) => set('situacoes', v)}
          />
          <TextInput label="Prefixo do patrimônio provisório" value={op.prefixoPatrimonio} onChange={(e) => set('prefixoPatrimonio', e.currentTarget.value.toUpperCase())} />
          <Select
            label="Tipo padrão (se não inferido)"
            allowDeselect={false}
            data={TIPOS.map((t) => ({ value: t, label: TIPO_LABEL[t] }))}
            value={op.tipoPadrao}
            onChange={(v) => v && set('tipoPadrao', v)}
          />
          <Select
            label="Status"
            allowDeselect={false}
            data={STATUS.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
            value={op.statusPadrao}
            onChange={(v) => v && set('statusPadrao', v)}
          />
          <TextInput label="Setor" value={op.setor} onChange={(e) => set('setor', e.currentTarget.value)} />
          <TextInput label="Localização" value={op.localizacao} onChange={(e) => set('localizacao', e.currentTarget.value)} />
          <TextInput label="TAG" value={op.tag} onChange={(e) => set('tag', e.currentTarget.value)} />
          <FuncionarioSelect label="Responsável" value={op.funcionarioId} onChange={(id) => set('funcionarioId', id)} />
          <Select
            label="Adicionar ao grupo estático"
            clearable
            data={grupos.filter((g) => g.tipo === 'estatico').map((g) => ({ value: String(g.id), label: g.nome }))}
            value={op.grupoId}
            onChange={(v) => set('grupoId', v)}
          />
        </SimpleGrid>
        <Group>
          <Checkbox label="Somente hosts ativos (alive)" checked={op.somenteAtivos} onChange={(e) => set('somenteAtivos', e.currentTarget.checked)} />
          <Checkbox label="Inferir tipo pelo SO/portas" checked={op.inferirTipo} onChange={(e) => set('inferirTipo', e.currentTarget.checked)} />
          <Checkbox
            label="Atualizar itens já inventariados (IP/hostname/SO)"
            checked={op.atualizarExistentes}
            onChange={(e) => set('atualizarExistentes', e.currentTarget.checked)}
          />
        </Group>

        {rel && <RelatorioView rel={rel} />}

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Fechar
          </Button>
          <Button variant="light" onClick={() => executar(true)} loading={rodando}>
            Simular
          </Button>
          <Button onClick={() => executar(false)} loading={rodando} disabled={!rel?.simulado}>
            Importar
          </Button>
        </Group>
        {!rel?.simulado && !rel && (
          <Text size="xs" c="dimmed" ta="right">
            Rode a simulação antes de importar.
          </Text>
        )}
      </Stack>
    </Modal>
  );
}

function RelatorioView({ rel }: { rel: Relatorio }) {
  const tabela = (linhas: (Linha & Record<string, unknown>)[], extra: (l: Linha & Record<string, unknown>) => React.ReactNode) => (
    <ScrollArea.Autosize mah={240}>
      <Table fz="xs" verticalSpacing={2}>
        <Table.Tbody>
          {linhas.map((l) => (
            <Table.Tr key={`${l.hostId}`}>
              <Table.Td className="mono">{l.ip}</Table.Td>
              <Table.Td className="mono">{l.mac ?? '—'}</Table.Td>
              <Table.Td>{l.hostname ?? ''}</Table.Td>
              <Table.Td>{extra(l)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </ScrollArea.Autosize>
  );
  return (
    <Stack gap="xs">
      <Group gap="xs">
        <Badge color={rel.simulado ? 'yellow' : 'teal'}>{rel.simulado ? 'Simulação' : 'Executado'}</Badge>
        <Text size="sm">
          {rel.analisados} analisados · <b>{rel.criados.length}</b> {rel.simulado ? 'seriam criados' : 'criados'} · {rel.atualizados.length}{' '}
          {rel.simulado ? 'seriam atualizados' : 'atualizados'} · {rel.ignorados.length} ignorados
        </Text>
      </Group>
      <Tabs defaultValue="criados">
        <Tabs.List>
          <Tabs.Tab value="criados">Novos ({rel.criados.length})</Tabs.Tab>
          <Tabs.Tab value="atualizados">Atualizados ({rel.atualizados.length})</Tabs.Tab>
          <Tabs.Tab value="ignorados">Ignorados ({rel.ignorados.length})</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="criados" pt="xs">
          {tabela(rel.criados, (l) => (
            <>
              <Badge size="xs" variant="light">
                {TIPO_LABEL[l.tipo as keyof typeof TIPO_LABEL]}
              </Badge>{' '}
              {(l.patrimonio as string) ?? ''}
            </>
          ))}
        </Tabs.Panel>
        <Tabs.Panel value="atualizados" pt="xs">
          {tabela(rel.atualizados, (l) => ((l.campos as string[]).length ? (l.campos as string[]).join(', ') : 'último visto'))}
        </Tabs.Panel>
        <Tabs.Panel value="ignorados" pt="xs">
          {tabela(rel.ignorados, (l) => l.motivo as string)}
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
