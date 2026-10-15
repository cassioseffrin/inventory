'use client';

import { Alert, Anchor, Badge, Button, Card, Chip, Group, Loader, Modal, Radio, Stack, Table, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconGitMerge } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, mensagemErro, qs } from '@/lib/api';
import { CAMPO_LABEL, STATUS_LABEL, TIPO_LABEL } from '@/lib/constants';
import type { ItemDetalhe } from '@/lib/types';

type DupItem = { id: number; numeroPatrimonio: string; hostname: string | null; ip: string | null; mac: string | null; numeroSerie: string | null; status: string; updatedAt: string };
type Dup = { criterio: 'mac' | 'numeroSerie' | 'hostname' | 'ip'; valor: string; itens: DupItem[] };

const CRITERIOS = { mac: 'Mesmo MAC', numeroSerie: 'Mesmo nº de série', hostname: 'Mesmo hostname', ip: 'Mesmo IP' } as const;

const CAMPOS_MESCLA = [
  'numeroPatrimonio', 'tag', 'tipo', 'status', 'funcionarioId', 'setor', 'localizacao', 'ip', 'mac', 'hostname', 'osName', 'osFlavor',
  'arch', 'fabricante', 'modelo', 'numeroSerie', 'dataAquisicao', 'notaFiscal', 'fornecedor', 'observacoes', 'msfHostId', 'ultimoVistoMsf',
] as const;

function valorLegivel(i: ItemDetalhe, campo: string): string {
  if (campo === 'funcionarioId') return i.funcionarioNome ?? '';
  if (campo === 'tipo') return TIPO_LABEL[i.tipo];
  if (campo === 'status') return STATUS_LABEL[i.status];
  const v = (i as unknown as Record<string, unknown>)[campo];
  return v === null || v === undefined ? '' : String(v);
}

/** Mescla dois itens escolhendo, campo a campo, qual valor manter. */
function MesclarModal({ ids, onClose }: { ids: [number, number]; onClose: () => void }) {
  const qc = useQueryClient();
  const [a, setA] = useState<ItemDetalhe | null>(null);
  const [b, setB] = useState<ItemDetalhe | null>(null);
  const [manter, setManter] = useState<'a' | 'b'>('a');
  const [escolhas, setEscolhas] = useState<Record<string, 'a' | 'b'>>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    Promise.all(ids.map((id) => api<ItemDetalhe>(`/api/itens/${id}`))).then(([x, y]) => {
      setA(x);
      setB(y);
      // pré-seleciona: valor preenchido vence o vazio; em empate, o do item mantido
      const e: Record<string, 'a' | 'b'> = {};
      for (const c of CAMPOS_MESCLA) e[c] = !valorLegivel(x, c) && valorLegivel(y, c) ? 'b' : 'a';
      setEscolhas(e);
    });
  }, [ids]);

  if (!a || !b)
    return (
      <Modal opened onClose={onClose} title="Mesclar itens">
        <Loader size="sm" />
      </Modal>
    );

  const mantido = manter === 'a' ? a : b;
  const removido = manter === 'a' ? b : a;
  const diferentes = CAMPOS_MESCLA.filter((c) => valorLegivel(a, c) !== valorLegivel(b, c));

  const mesclar = async () => {
    setSalvando(true);
    try {
      const esc = Object.fromEntries(diferentes.map((c) => [c, escolhas[c] === manter ? 'manter' : 'remover']));
      await api('/api/duplicados/mesclar', { method: 'POST', json: { manterId: mantido.id, removerId: removido.id, escolhas: esc } });
      notifications.show({ color: 'teal', message: `Itens mesclados em #${mantido.id}` });
      ['duplicados', 'itens', 'item', 'hosts', 'dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      onClose();
    } catch (e) {
      notifications.show({ color: 'red', message: mensagemErro(e) });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal opened onClose={onClose} title="Mesclar itens" size="xl">
      <Stack>
        <Radio.Group label="Registro que permanece (o outro é removido)" value={manter} onChange={(v) => setManter(v as 'a' | 'b')}>
          <Group mt={4}>
            <Radio value="a" label={`${a.numeroPatrimonio} (#${a.id})`} />
            <Radio value="b" label={`${b.numeroPatrimonio} (#${b.id})`} />
          </Group>
        </Radio.Group>
        <Alert variant="light">
          Interfaces, discos, softwares, campos customizados, grupos e histórico do item removido são transferidos. A mesclagem fica registrada no
          histórico.
        </Alert>
        {diferentes.length === 0 ? (
          <Text size="sm">Os campos principais são idênticos.</Text>
        ) : (
          <Table withTableBorder fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Campo</Table.Th>
                <Table.Th>
                  {a.numeroPatrimonio} (#{a.id})
                </Table.Th>
                <Table.Th>
                  {b.numeroPatrimonio} (#{b.id})
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {diferentes.map((c) => (
                <Table.Tr key={c}>
                  <Table.Td fw={600}>{CAMPO_LABEL[c] ?? c}</Table.Td>
                  {(['a', 'b'] as const).map((lado) => (
                    <Table.Td key={lado}>
                      <Radio
                        checked={escolhas[c] === lado}
                        onChange={() => setEscolhas((e) => ({ ...e, [c]: lado }))}
                        label={valorLegivel(lado === 'a' ? a : b, c) || <i>vazio</i>}
                      />
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button color="orange" leftSection={<IconGitMerge size={16} />} onClick={mesclar} loading={salvando}>
            Mesclar e remover {removido.numeroPatrimonio}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default function DuplicadosPage() {
  const [criterios, setCriterios] = useState<string[]>(['mac', 'numeroSerie', 'hostname', 'ip']);
  const [mesclar, setMesclar] = useState<[number, number] | null>(null);
  const { data = [], isFetching } = useQuery({
    queryKey: ['duplicados', criterios],
    queryFn: () => api<Dup[]>(`/api/duplicados${qs({ criterios })}`),
    enabled: criterios.length > 0,
  });

  return (
    <Stack>
      <Title order={3}>Possíveis duplicados</Title>
      <Group>
        <Text size="sm">Critérios:</Text>
        <Chip.Group multiple value={criterios} onChange={setCriterios}>
          <Group gap="xs">
            {Object.entries(CRITERIOS).map(([k, l]) => (
              <Chip key={k} value={k} size="sm">
                {l}
              </Chip>
            ))}
          </Group>
        </Chip.Group>
        {isFetching && <Loader size="xs" />}
      </Group>
      {!data.length && !isFetching && <Alert color="teal">Nenhum duplicado encontrado com os critérios selecionados.</Alert>}
      {data.map((d) => (
        <Card key={`${d.criterio}:${d.valor}`} withBorder>
          <Group mb="xs">
            <Badge variant="light">{CRITERIOS[d.criterio]}</Badge>
            <Text className="mono" fw={600}>
              {d.valor}
            </Text>
            <Text size="sm" c="dimmed">
              {d.itens.length} itens
            </Text>
          </Group>
          <Table fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Patrimônio</Table.Th>
                <Table.Th>Hostname</Table.Th>
                <Table.Th>IP</Table.Th>
                <Table.Th>MAC</Table.Th>
                <Table.Th>Nº série</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {d.itens.map((i, idx) => (
                <Table.Tr key={i.id}>
                  <Table.Td>
                    <Anchor component={Link} href={`/inventario/${i.id}`} fw={600} size="sm">
                      {i.numeroPatrimonio}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>{i.hostname}</Table.Td>
                  <Table.Td className="mono">{i.ip}</Table.Td>
                  <Table.Td className="mono">{i.mac}</Table.Td>
                  <Table.Td>{i.numeroSerie}</Table.Td>
                  <Table.Td>{STATUS_LABEL[i.status as keyof typeof STATUS_LABEL]}</Table.Td>
                  <Table.Td>
                    {idx > 0 && (
                      <Button size="compact-xs" variant="light" color="orange" leftSection={<IconGitMerge size={12} />} onClick={() => setMesclar([d.itens[0].id, i.id])}>
                        Mesclar com {d.itens[0].numeroPatrimonio}
                      </Button>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      ))}
      {mesclar && <MesclarModal ids={mesclar} onClose={() => setMesclar(null)} />}
    </Stack>
  );
}
