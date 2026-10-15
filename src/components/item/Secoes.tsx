'use client';

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  FileButton,
  Group,
  NumberInput,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Timeline,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconArrowsExchange,
  IconEdit,
  IconFileImport,
  IconGitMerge,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconUpload,
  IconUserShare,
  IconX,
} from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, mensagemErro } from '@/lib/api';
import { ACAO_LABEL, CAMPO_LABEL, CATEGORIA_LABEL } from '@/lib/constants';
import { fmtDataHora, fmtRelativo } from '@/lib/format';
import type { Historico } from '@/lib/types';

type Hardware = {
  cpu: string | null;
  cpuNucleos: number | null;
  ramMb: number | null;
  placaMae: string | null;
  biosFabricante: string | null;
  biosVersao: string | null;
  biosData: string | null;
  origem: string;
  updatedAt: string;
};
type Disco = { id: number; nome: string | null; tipo: string | null; tamanhoGb: string | null; fabricante: string | null; modelo: string | null; numeroSerie: string | null; origem: string };
type Interface = { id: number; nome: string | null; ip: string | null; mascara: string | null; mac: string | null; vlan: number | null; gateway: string | null; origem: string };
type Secoes = { hardware: Hardware | null; discos: Disco[]; interfaces: Interface[] };

const ORIGEM_COR: Record<string, string> = { msf: 'grape', manual: 'gray', importacao: 'cyan' };
const Origem = ({ o }: { o: string }) => (
  <Badge size="xs" variant="light" color={ORIGEM_COR[o] ?? 'gray'}>
    {o === 'importacao' ? 'importação' : o}
  </Badge>
);

function useSecoes(itemId: number) {
  return useQuery({ queryKey: ['secoes', itemId], queryFn: () => api<Secoes>(`/api/itens/${itemId}/secoes`) });
}

function useInvalidar(itemId: number) {
  const qc = useQueryClient();
  return () => ['secoes', 'softwares', 'historico', 'item'].forEach((k) => qc.invalidateQueries({ queryKey: [k, itemId] }));
}

async function chamar(fn: () => Promise<unknown>, ok: string, depois: () => void) {
  try {
    await fn();
    notifications.show({ color: 'teal', message: ok });
    depois();
  } catch (e) {
    notifications.show({ color: 'red', message: mensagemErro(e) });
  }
}

// ------------------------------------------------------------------------------------------------ hardware

export function AbaHardware({ itemId }: { itemId: number }) {
  const { data } = useSecoes(itemId);
  const invalidar = useInvalidar(itemId);
  const [hw, setHw] = useState<Partial<Hardware>>({});
  useEffect(() => setHw(data?.hardware ?? {}), [data?.hardware]);
  const [disco, setDisco] = useState<Partial<Disco>>({});

  const campo = (k: keyof Hardware, label: string) => (
    <TextInput label={label} value={(hw[k] as string) ?? ''} onChange={(e) => setHw({ ...hw, [k]: e.currentTarget.value })} />
  );

  return (
    <Stack>
      <Card withBorder>
        <Group justify="space-between" mb="xs">
          <Title order={6}>Processador, memória e BIOS</Title>
          {data?.hardware && (
            <Text size="xs" c="dimmed">
              <Origem o={data.hardware.origem} /> atualizado {fmtRelativo(data.hardware.updatedAt)}
            </Text>
          )}
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
          {campo('cpu', 'CPU')}
          <NumberInput label="Núcleos" value={hw.cpuNucleos ?? ''} onChange={(v) => setHw({ ...hw, cpuNucleos: v === '' ? null : Number(v) })} />
          <NumberInput label="RAM (MB)" value={hw.ramMb ?? ''} onChange={(v) => setHw({ ...hw, ramMb: v === '' ? null : Number(v) })} thousandSeparator="." decimalSeparator="," />
          {campo('placaMae', 'Placa-mãe')}
          {campo('biosFabricante', 'BIOS — fabricante')}
          {campo('biosVersao', 'BIOS — versão')}
          {campo('biosData', 'BIOS — data')}
        </SimpleGrid>
        <Group justify="flex-end" mt="sm">
          <Button
            size="xs"
            onClick={() =>
              chamar(
                () =>
                  api(`/api/itens/${itemId}/hardware`, {
                    method: 'PUT',
                    json: {
                      cpu: hw.cpu,
                      cpuNucleos: hw.cpuNucleos,
                      ramMb: hw.ramMb,
                      placaMae: hw.placaMae,
                      biosFabricante: hw.biosFabricante,
                      biosVersao: hw.biosVersao,
                      biosData: hw.biosData,
                    },
                  }),
                'Hardware salvo',
                invalidar,
              )
            }
          >
            Salvar hardware
          </Button>
        </Group>
      </Card>

      <Card withBorder>
        <Title order={6} mb="xs">
          Discos ({data?.discos.length ?? 0})
        </Title>
        <Table fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Nome</Table.Th>
              <Table.Th>Tipo</Table.Th>
              <Table.Th>Tamanho (GB)</Table.Th>
              <Table.Th>Fabricante</Table.Th>
              <Table.Th>Modelo</Table.Th>
              <Table.Th>Nº série</Table.Th>
              <Table.Th>Origem</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data?.discos.map((d) => (
              <Table.Tr key={d.id}>
                <Table.Td>{d.nome}</Table.Td>
                <Table.Td>{d.tipo}</Table.Td>
                <Table.Td>{d.tamanhoGb}</Table.Td>
                <Table.Td>{d.fabricante}</Table.Td>
                <Table.Td>{d.modelo}</Table.Td>
                <Table.Td>{d.numeroSerie}</Table.Td>
                <Table.Td>
                  <Origem o={d.origem} />
                </Table.Td>
                <Table.Td>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    size="sm"
                    aria-label="Remover disco"
                    onClick={() => chamar(() => api(`/api/itens/${itemId}/linhas/discos/${d.id}`, { method: 'DELETE' }), 'Disco removido', invalidar)}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
            <Table.Tr>
              {(['nome', 'tipo', 'tamanhoGb', 'fabricante', 'modelo', 'numeroSerie'] as const).map((k) => (
                <Table.Td key={k}>
                  <TextInput size="xs" placeholder={k === 'tamanhoGb' ? 'GB' : ''} value={(disco[k] as string) ?? ''} onChange={(e) => setDisco({ ...disco, [k]: e.currentTarget.value })} />
                </Table.Td>
              ))}
              <Table.Td colSpan={2}>
                <Button
                  size="compact-xs"
                  leftSection={<IconPlus size={12} />}
                  onClick={() =>
                    chamar(() => api(`/api/itens/${itemId}/linhas/discos`, { method: 'POST', json: disco }), 'Disco adicionado', () => {
                      setDisco({});
                      invalidar();
                    })
                  }
                >
                  Adicionar
                </Button>
              </Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </Card>
    </Stack>
  );
}

// ------------------------------------------------------------------------------------------------ rede

export function AbaRede({ itemId }: { itemId: number }) {
  const { data } = useSecoes(itemId);
  const invalidar = useInvalidar(itemId);
  const [nova, setNova] = useState<Partial<Interface>>({});
  return (
    <Card withBorder>
      <Title order={6} mb="xs">
        Interfaces de rede
      </Title>
      <Text size="xs" c="dimmed" mb="xs">
        Interfaces “msf” espelham o host de origem e são atualizadas pela sincronização; as manuais e importadas não.
      </Text>
      <Table fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Nome</Table.Th>
            <Table.Th>IP</Table.Th>
            <Table.Th>Máscara</Table.Th>
            <Table.Th>MAC</Table.Th>
            <Table.Th>VLAN</Table.Th>
            <Table.Th>Gateway</Table.Th>
            <Table.Th>Origem</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data?.interfaces.map((i) => (
            <Table.Tr key={i.id}>
              <Table.Td>{i.nome}</Table.Td>
              <Table.Td className="mono">{i.ip}</Table.Td>
              <Table.Td className="mono">{i.mascara}</Table.Td>
              <Table.Td className="mono">{i.mac}</Table.Td>
              <Table.Td>{i.vlan}</Table.Td>
              <Table.Td className="mono">{i.gateway}</Table.Td>
              <Table.Td>
                <Origem o={i.origem} />
              </Table.Td>
              <Table.Td>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size="sm"
                  aria-label="Remover interface"
                  onClick={() => chamar(() => api(`/api/itens/${itemId}/linhas/interfaces/${i.id}`, { method: 'DELETE' }), 'Interface removida', invalidar)}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Table.Td>
            </Table.Tr>
          ))}
          <Table.Tr>
            {(['nome', 'ip', 'mascara', 'mac', 'vlan', 'gateway'] as const).map((k) => (
              <Table.Td key={k}>
                <TextInput size="xs" value={(nova[k] as string) ?? ''} onChange={(e) => setNova({ ...nova, [k]: e.currentTarget.value })} />
              </Table.Td>
            ))}
            <Table.Td colSpan={2}>
              <Button
                size="compact-xs"
                leftSection={<IconPlus size={12} />}
                onClick={() =>
                  chamar(() => api(`/api/itens/${itemId}/linhas/interfaces`, { method: 'POST', json: nova }), 'Interface adicionada', () => {
                    setNova({});
                    invalidar();
                  })
                }
              >
                Adicionar
              </Button>
            </Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>
    </Card>
  );
}

// ------------------------------------------------------------------------------------------------ software

type Sw = { id: number; nome: string; versao: string | null; editor: string | null; dataInstalacao: string | null; origem: string; nomeCanonico: string | null; categoria: string | null };

export function AbaSoftware({ itemId }: { itemId: number }) {
  const invalidar = useInvalidar(itemId);
  const { data = [] } = useQuery({ queryKey: ['softwares', itemId], queryFn: () => api<Sw[]>(`/api/itens/${itemId}/softwares`) });
  const [novo, setNovo] = useState({ nome: '', versao: '', editor: '' });
  const [sobrescrever, setSobrescrever] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [filtro, setFiltro] = useState('');
  const proibidos = data.filter((s) => s.categoria === 'proibido');

  const importar = async (f: File | null) => {
    if (!f) return;
    setEnviando(true);
    const fd = new FormData();
    fd.set('arquivo', f);
    fd.set('atualizarItem', String(sobrescrever));
    try {
      const r = await api<{ softwares: number; discos: number; interfaces: number; hardware: boolean; camposItem: string[] }>(`/api/itens/${itemId}/importar`, {
        method: 'POST',
        body: fd,
      });
      notifications.show({
        color: 'teal',
        title: 'Coleta importada',
        message: `${r.softwares} softwares, ${r.discos} discos, ${r.interfaces} interfaces${r.hardware ? ', hardware' : ''}${r.camposItem.length ? `; atualizou ${r.camposItem.join(', ')}` : ''}`,
      });
      invalidar();
    } catch (e) {
      notifications.show({ color: 'red', message: mensagemErro(e) });
    } finally {
      setEnviando(false);
    }
  };

  const visiveis = filtro ? data.filter((s) => `${s.nome} ${s.editor ?? ''} ${s.nomeCanonico ?? ''}`.toLowerCase().includes(filtro.toLowerCase())) : data;

  return (
    <Stack>
      {proibidos.length > 0 && (
        <Alert color="red" icon={<IconAlertTriangle size={18} />} title="Software proibido instalado">
          {proibidos.map((p) => `${p.nome} ${p.versao ?? ''}`).join(', ')}
        </Alert>
      )}
      <Card withBorder>
        <Group justify="space-between">
          <div>
            <Title order={6}>Importar coleta (JSON / CSV / XML OCS-GLPI)</Title>
            <Text size="xs" c="dimmed">
              Substitui softwares, discos e interfaces importados antes; itens manuais são mantidos. Scripts de coleta em scripts/coleta.
            </Text>
          </div>
          <Group>
            <Checkbox size="xs" label="Sobrescrever fabricante/modelo/série/hostname/SO" checked={sobrescrever} onChange={(e) => setSobrescrever(e.currentTarget.checked)} />
            <FileButton onChange={importar} accept=".json,.csv,.xml,.txt,.ocs">
              {(props) => (
                <Button {...props} size="xs" leftSection={<IconUpload size={14} />} loading={enviando}>
                  Enviar arquivo
                </Button>
              )}
            </FileButton>
          </Group>
        </Group>
      </Card>
      <Card withBorder>
        <Group justify="space-between" mb="xs">
          <Title order={6}>Softwares instalados ({data.length})</Title>
          <TextInput size="xs" placeholder="Filtrar" value={filtro} onChange={(e) => setFiltro(e.currentTarget.value)} w={220} />
        </Group>
        <Table fz="sm" striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Nome</Table.Th>
              <Table.Th>Versão</Table.Th>
              <Table.Th>Editor</Table.Th>
              <Table.Th>Dicionário</Table.Th>
              <Table.Th>Origem</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {visiveis.map((s) => (
              <Table.Tr key={s.id} bg={s.categoria === 'proibido' ? 'var(--mantine-color-red-light)' : undefined}>
                <Table.Td>{s.nome}</Table.Td>
                <Table.Td>{s.versao}</Table.Td>
                <Table.Td>{s.editor}</Table.Td>
                <Table.Td>
                  {s.nomeCanonico ? (
                    <Group gap={4}>
                      <Text size="sm">{s.nomeCanonico}</Text>
                      <Badge size="xs" color={s.categoria === 'proibido' ? 'red' : 'blue'} variant="light">
                        {CATEGORIA_LABEL[s.categoria as keyof typeof CATEGORIA_LABEL] ?? s.categoria}
                      </Badge>
                    </Group>
                  ) : (
                    <Text size="xs" c="dimmed">
                      não classificado
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Origem o={s.origem} />
                </Table.Td>
                <Table.Td>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    size="sm"
                    aria-label="Remover software"
                    onClick={() => chamar(() => api(`/api/itens/${itemId}/linhas/softwares/${s.id}`, { method: 'DELETE' }), 'Removido', invalidar)}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
            <Table.Tr>
              <Table.Td>
                <TextInput size="xs" placeholder="Nome" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.currentTarget.value })} />
              </Table.Td>
              <Table.Td>
                <TextInput size="xs" placeholder="Versão" value={novo.versao} onChange={(e) => setNovo({ ...novo, versao: e.currentTarget.value })} />
              </Table.Td>
              <Table.Td>
                <TextInput size="xs" placeholder="Editor" value={novo.editor} onChange={(e) => setNovo({ ...novo, editor: e.currentTarget.value })} />
              </Table.Td>
              <Table.Td colSpan={3}>
                <Button
                  size="compact-xs"
                  leftSection={<IconPlus size={12} />}
                  disabled={!novo.nome.trim()}
                  onClick={() =>
                    chamar(() => api(`/api/itens/${itemId}/softwares`, { method: 'POST', json: novo }), 'Software adicionado', () => {
                      setNovo({ nome: '', versao: '', editor: '' });
                      invalidar();
                    })
                  }
                >
                  Adicionar manualmente
                </Button>
              </Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </Card>
    </Stack>
  );
}

// ------------------------------------------------------------------------------------------------ serviços (msf)

type Servicos = {
  host: { id: number; address: string; workspace: string | null; updatedAt: string | null } | null;
  criterio: string | null;
  servicos: { id: number; port: number; proto: string; state: string | null; name: string | null; info: string | null }[];
};

export function AbaServicos({ itemId }: { itemId: number }) {
  const { data, isLoading, error } = useQuery({ queryKey: ['servicos', itemId], queryFn: () => api<Servicos>(`/api/itens/${itemId}/servicos`) });
  if (isLoading) return <Text size="sm">Consultando msf…</Text>;
  if (error) return <Alert color="red">{mensagemErro(error)}</Alert>;
  if (!data?.host) return <Alert color="yellow">Host de origem não encontrado no msf.</Alert>;
  return (
    <Card withBorder>
      <Text size="sm" mb="xs">
        Host msf #{data.host.id} <span className="mono">{data.host.address}</span> · workspace {data.host.workspace} · match por {data.criterio} ·
        visto {fmtRelativo(data.host.updatedAt)} <Badge size="xs">somente leitura</Badge>
      </Text>
      <Table fz="sm" striped>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Porta</Table.Th>
            <Table.Th>Estado</Table.Th>
            <Table.Th>Serviço</Table.Th>
            <Table.Th>Info</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data.servicos.map((s) => (
            <Table.Tr key={s.id}>
              <Table.Td className="mono">
                {s.port}/{s.proto}
              </Table.Td>
              <Table.Td>{s.state}</Table.Td>
              <Table.Td>{s.name}</Table.Td>
              <Table.Td>{s.info}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Card>
  );
}

// ------------------------------------------------------------------------------------------------ histórico

const ICONE: Record<string, React.ReactNode> = {
  criacao: <IconPlus size={12} />,
  alteracao: <IconEdit size={12} />,
  troca_responsavel: <IconUserShare size={12} />,
  sincronizacao: <IconRefresh size={12} />,
  importacao: <IconFileImport size={12} />,
  mesclagem: <IconGitMerge size={12} />,
  exclusao: <IconX size={12} />,
};

/** Linha do tempo: agrupa as mudanças de campo feitas no mesmo instante, pelo mesmo usuário e ação. */
export function AbaHistorico({ itemId }: { itemId: number }) {
  const { data = [] } = useQuery({ queryKey: ['historico', itemId], queryFn: () => api<Historico[]>(`/api/itens/${itemId}/historico`) });
  const grupos: { chave: string; h: Historico; linhas: Historico[] }[] = [];
  for (const h of data) {
    const chave = `${h.createdAt.slice(0, 19)}|${h.usuario}|${h.acao}`;
    const g = grupos.at(-1);
    if (g && g.chave === chave) g.linhas.push(h);
    else grupos.push({ chave, h, linhas: [h] });
  }
  if (!data.length) return <Text c="dimmed">Sem histórico.</Text>;
  return (
    <Timeline bulletSize={22} lineWidth={2} mt="sm">
      {grupos.map((g) => (
        <Timeline.Item
          key={g.h.id}
          bullet={ICONE[g.h.acao] ?? <IconArrowsExchange size={12} />}
          color={g.h.acao === 'troca_responsavel' ? 'orange' : g.h.acao === 'exclusao' ? 'red' : undefined}
          title={
            <Group gap="xs">
              <Text fw={600} size="sm">
                {ACAO_LABEL[g.h.acao] ?? g.h.acao}
              </Text>
              <Text size="xs" c="dimmed">
                {fmtDataHora(g.h.createdAt)} · {g.h.usuario}
              </Text>
            </Group>
          }
        >
          {g.linhas
            .filter((l) => l.campo)
            .map((l) => (
              <Text key={l.id} size="sm">
                <b>{CAMPO_LABEL[l.campo!] ?? l.campo}</b>:{' '}
                {l.valorAntigo !== null && (
                  <>
                    <Text span td="line-through" c="dimmed">
                      {l.valorAntigo}
                    </Text>{' '}
                    →{' '}
                  </>
                )}
                {l.valorNovo ?? <i>vazio</i>}
              </Text>
            ))}
        </Timeline.Item>
      ))}
    </Timeline>
  );
}
