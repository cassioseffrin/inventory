'use client';

import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  NumberInput,
  Paper,
  Progress,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconCheck, IconInfoCircle, IconTrash } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { api, mensagemErro } from '@/lib/api';
import type { Status, Tipo } from '@/lib/constants';
import { COEF_TURNOS, LIMITE_PEQUENO_VALOR, TAXA_SUGERIDA, calcularDepreciacao, fmtMoeda, type LinhaAnual } from '@/lib/depreciacao';
import { fmtData, fmtDataHora } from '@/lib/format';
import type { ItemCusto } from '@/lib/types';

type Form = {
  valorAquisicao: number | '';
  custosAdicionais: number | '';
  valorResidual: number | '';
  dataInicioUso: string;
  taxaAnual: number | '';
  turnos: number;
  dataBaixa: string;
  observacao: string;
};

const SITUACAO: Record<LinhaAnual['situacao'], { label: string; cor: string }> = {
  realizado: { label: 'realizado', cor: 'gray' },
  em_curso: { label: 'em curso', cor: 'blue' },
  projetado: { label: 'projetado', cor: 'grape' },
};

const moedaProps = { prefix: 'R$ ', thousandSeparator: '.', decimalSeparator: ',', decimalScale: 2, fixedDecimalScale: true, min: 0, allowNegative: false } as const;
const num = (v: number | '') => (v === '' ? 0 : v);
const fmtPct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
const fmtVida = (meses: number) => {
  const a = Math.floor(meses / 12);
  const m = meses % 12;
  return [a && `${a} ano${a > 1 ? 's' : ''}`, m && `${m} ${m > 1 ? 'meses' : 'mês'}`].filter(Boolean).join(' e ');
};

function paraForm(c: ItemCusto | null, tipo: Tipo, dataAquisicao: string | null): Form {
  return {
    valorAquisicao: c ? Number(c.valorAquisicao) : '',
    custosAdicionais: c ? Number(c.custosAdicionais) : 0,
    valorResidual: c ? Number(c.valorResidual) : 0,
    dataInicioUso: c?.dataInicioUso ?? dataAquisicao ?? '',
    taxaAnual: c ? Number(c.taxaAnual) : TAXA_SUGERIDA[tipo].taxa,
    turnos: c?.turnos ?? 1,
    dataBaixa: c?.dataBaixa ?? '',
    observacao: c?.observacao ?? '',
  };
}

function Valor({ label, valor, cor }: { label: string; valor: string; cor?: string }) {
  return (
    <Paper withBorder p="sm">
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={700} size="lg" c={cor}>
        {valor}
      </Text>
    </Paper>
  );
}

export function AbaCusto({ itemId, tipo, status, dataAquisicao }: { itemId: number; tipo: Tipo; status: Status; dataAquisicao: string | null }) {
  const qc = useQueryClient();
  const { data: salvo, isLoading } = useQuery({ queryKey: ['custo', itemId], queryFn: () => api<ItemCusto | null>(`/api/itens/${itemId}/custo`) });
  const [f, setF] = useState<Form>(() => paraForm(null, tipo, dataAquisicao));
  useEffect(() => {
    if (!isLoading) setF(paraForm(salvo ?? null, tipo, dataAquisicao));
  }, [salvo, isLoading, tipo, dataAquisicao]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  const sugerida = TAXA_SUGERIDA[tipo];
  const custoTotal = num(f.valorAquisicao) + num(f.custosAdicionais);
  const erroResidual = num(f.valorResidual) > custoTotal ? 'Maior que o custo' : null;
  const erroBaixa = f.dataBaixa && f.dataInicioUso && f.dataBaixa < f.dataInicioUso ? 'Anterior ao início de uso' : null;
  const valido = f.valorAquisicao !== '' && !!f.dataInicioUso && num(f.taxaAnual) > 0 && !erroResidual && !erroBaixa;

  // Prévia ao vivo: reflete o formulário antes de salvar
  const r = useMemo(
    () =>
      valido
        ? calcularDepreciacao({
            valorAquisicao: num(f.valorAquisicao),
            custosAdicionais: num(f.custosAdicionais),
            valorResidual: num(f.valorResidual),
            dataInicioUso: f.dataInicioUso,
            taxaAnual: num(f.taxaAnual),
            turnos: f.turnos,
            dataBaixa: f.dataBaixa || null,
          })
        : null,
    [f, valido],
  );

  const invalidar = () => ['custo', 'historico'].forEach((k) => qc.invalidateQueries({ queryKey: [k, itemId] }));

  const salvar = async () => {
    try {
      await api(`/api/itens/${itemId}/custo`, {
        method: 'PUT',
        json: { ...f, custosAdicionais: num(f.custosAdicionais), valorResidual: num(f.valorResidual) },
      });
      notifications.show({ color: 'teal', message: 'Custo salvo' });
      invalidar();
    } catch (e) {
      notifications.show({ color: 'red', message: mensagemErro(e) });
    }
  };

  const remover = () =>
    modals.openConfirmModal({
      title: 'Remover custo e depreciação?',
      children: <Text size="sm">Os parâmetros deste item serão apagados. A alteração fica no histórico.</Text>,
      labels: { confirm: 'Remover', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await api(`/api/itens/${itemId}/custo`, { method: 'DELETE' });
          invalidar();
        } catch (e) {
          notifications.show({ color: 'red', message: mensagemErro(e) });
        }
      },
    });

  const data = (k: 'dataInicioUso' | 'dataBaixa', label: string, extra: { description?: string; error?: string | null; required?: boolean } = {}) => (
    <DateInput
      label={label}
      valueFormat="DD/MM/YYYY"
      clearable={k === 'dataBaixa'}
      value={f[k] ? dayjs(f[k]).toDate() : null}
      onChange={(d) => set(k, d ? dayjs(d).format('YYYY-MM-DD') : '')}
      {...extra}
    />
  );

  return (
    <Stack>
      <Card withBorder>
        <Group justify="space-between" mb="xs">
          <Title order={6}>Custo de aquisição e parâmetros</Title>
          {salvo && (
            <Text size="xs" c="dimmed">
              atualizado por {salvo.usuario} em {fmtDataHora(salvo.updatedAt)}
            </Text>
          )}
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
          <NumberInput label="Valor do bem (NF)" required {...moedaProps} value={f.valorAquisicao} onChange={(v) => set('valorAquisicao', v === '' ? '' : Number(v))} />
          <NumberInput
            label="Custos adicionais"
            description="Frete, seguro, instalação, impostos não recuperáveis"
            {...moedaProps}
            value={f.custosAdicionais}
            onChange={(v) => set('custosAdicionais', v === '' ? '' : Number(v))}
          />
          <NumberInput
            label="Valor residual"
            description="Fiscal: normalmente R$ 0,00"
            {...moedaProps}
            value={f.valorResidual}
            error={erroResidual}
            onChange={(v) => set('valorResidual', v === '' ? '' : Number(v))}
          />
          {data('dataInicioUso', 'Início de uso', {
            required: true,
            description: dataAquisicao && f.dataInicioUso !== dataAquisicao ? `Aquisição em ${fmtData(dataAquisicao)}` : 'Quando foi instalado/posto em serviço',
          })}
          <NumberInput
            label="Taxa anual"
            required
            suffix=" %"
            decimalSeparator=","
            decimalScale={2}
            min={0.01}
            max={100}
            allowNegative={false}
            value={f.taxaAnual}
            onChange={(v) => set('taxaAnual', v === '' ? '' : Number(v))}
            description={
              num(f.taxaAnual) === sugerida.taxa ? (
                `Sugerida: ${sugerida.fundamento}`
              ) : (
                <>
                  Sugerida {sugerida.taxa}% ({sugerida.fundamento}){' '}
                  <Anchor component="button" type="button" size="xs" onClick={() => set('taxaAnual', sugerida.taxa)}>
                    usar
                  </Anchor>
                </>
              )
            }
          />
          <div>
            <Text size="sm" fw={500}>
              Turnos de uso por dia
            </Text>
            <Text size="xs" c="dimmed" mb={4}>
              Depreciação acelerada (RIR/2018, art. 323)
            </Text>
            <SegmentedControl
              fullWidth
              value={String(f.turnos)}
              onChange={(v) => set('turnos', Number(v))}
              data={[1, 2, 3].map((t) => ({ value: String(t), label: `${t} (×${String(COEF_TURNOS[t]).replace('.', ',')})` }))}
            />
          </div>
          {data('dataBaixa', 'Data de baixa', { error: erroBaixa, description: 'Venda, descarte ou perda; encerra a depreciação' })}
          <Textarea label="Observação" autosize minRows={1} maxLength={2000} value={f.observacao} onChange={(e) => set('observacao', e.currentTarget.value)} />
        </SimpleGrid>
        <Group justify="flex-end" mt="sm">
          {salvo && (
            <Button size="xs" variant="subtle" color="red" leftSection={<IconTrash size={14} />} onClick={remover}>
              Remover
            </Button>
          )}
          <Button size="xs" disabled={!valido} onClick={salvar}>
            Salvar custo
          </Button>
        </Group>
      </Card>

      {status === 'baixado' && !f.dataBaixa && (
        <Alert color="yellow" icon={<IconAlertTriangle size={16} />}>
          O item está com status <b>Baixado</b>, mas sem data de baixa: a depreciação continua sendo calculada até hoje.
        </Alert>
      )}

      {!r ? (
        <Alert color="gray" icon={<IconInfoCircle size={16} />}>
          Informe o valor do bem, o início de uso e a taxa anual para calcular a depreciação.
        </Alert>
      ) : (
        <>
          {r.pequenoValor && (
            <Alert color="blue" icon={<IconInfoCircle size={16} />}>
              Custo de até {fmtMoeda(LIMITE_PEQUENO_VALOR)}: pode ser lançado diretamente como despesa, sem depreciação (RIR/2018, art. 313). Confirme o
              tratamento com a contabilidade.
            </Alert>
          )}
          {salvo === null && (
            <Alert color="gray" icon={<IconInfoCircle size={16} />}>
              Prévia do cálculo. Salve para registrar o custo deste item.
            </Alert>
          )}
          <Card withBorder>
            <Group justify="space-between" mb="sm">
              <Title order={6}>Posição em {dayjs().format('MM/YYYY')}</Title>
              {r.totalmenteDepreciado && (
                <Badge color="teal" leftSection={<IconCheck size={12} />}>
                  totalmente depreciado
                </Badge>
              )}
            </Group>
            <SimpleGrid cols={{ base: 2, md: 4 }}>
              <Valor label="Custo total" valor={fmtMoeda(r.custo)} />
              <Valor label="Depreciação acumulada" valor={fmtMoeda(r.acumulada)} />
              <Valor label="Valor contábil líquido" valor={fmtMoeda(r.valorContabil)} cor="teal" />
              <Valor label="Quota mensal" valor={fmtMoeda(r.quotaMensal)} />
            </SimpleGrid>
            <Progress value={r.percentual} mt="md" size="lg" />
            <Group justify="space-between" mt={4}>
              <Text size="xs" c="dimmed">
                {fmtPct(r.percentual)} da base depreciável ({fmtMoeda(r.baseDepreciavel)}) · {r.mesesDecorridos} de {r.vidaUtilMeses} meses
              </Text>
              <Text size="xs" c="dimmed">
                Taxa efetiva {fmtPct(r.taxaEfetiva)} a.a. · vida útil {fmtVida(r.vidaUtilMeses)} · fim {dayjs(`${r.fimPrevisto}-01`).format('MM/YYYY')}
              </Text>
            </Group>
          </Card>

          <Card withBorder>
            <Title order={6} mb="sm">
              Depreciação por exercício
            </Title>
            <Table.ScrollContainer minWidth={560}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Exercício</Table.Th>
                    <Table.Th ta="right">Meses</Table.Th>
                    <Table.Th ta="right">Depreciação no ano</Table.Th>
                    <Table.Th ta="right">Acumulada</Table.Th>
                    <Table.Th ta="right">Valor contábil</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {r.anual.map((l) => (
                    <Table.Tr key={l.ano}>
                      <Table.Td>{l.ano}</Table.Td>
                      <Table.Td ta="right">{l.meses}</Table.Td>
                      <Table.Td ta="right">{fmtMoeda(l.depreciacao)}</Table.Td>
                      <Table.Td ta="right">{fmtMoeda(l.acumulada)}</Table.Td>
                      <Table.Td ta="right">{fmtMoeda(l.valorContabil)}</Table.Td>
                      <Table.Td>
                        <Badge size="xs" variant="light" color={SITUACAO[l.situacao].cor}>
                          {SITUACAO[l.situacao].label}
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Card>
        </>
      )}

      <Text size="xs" c="dimmed">
        Método linear (cotas constantes). Base legal: RIR/2018 (Decreto 9.580/2018), arts. 311 a 330; taxas da IN RFB 1.700/2017, Anexo III; custo e
        valor residual conforme CPC 27 / NBC TG 27. O mês de início de uso conta como mês cheio e a depreciação nunca ultrapassa a base depreciável.
        As taxas sugeridas são fiscais. Para a contabilidade societária, a vida útil econômica pode ser diferente.
      </Text>
    </Stack>
  );
}
