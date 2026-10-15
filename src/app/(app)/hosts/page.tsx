'use client';

import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Menu,
  MultiSelect,
  Progress,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  IconChevronDown,
  IconChevronRight,
  IconDatabaseImport,
  IconDots,
  IconEyeOff,
  IconPlus,
  IconRefresh,
  IconRouter,
  IconSearch,
  IconTrash,
} from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { DataTable, type Ordenacao } from '@/components/DataTable';
import { ClassificarModal } from '@/components/hosts/ClassificarModal';
import { ClonarModal } from '@/components/hosts/ClonarModal';
import { HostDetalhe } from '@/components/hosts/HostDetalhe';
import { ImportacaoMassaModal } from '@/components/hosts/ImportacaoMassaModal';
import { api, mensagemErro, qs, type Pagina } from '@/lib/api';
import { SITUACAO_COLOR, SITUACAO_LABEL, type HostSituacao } from '@/lib/constants';
import { fmtDataHora, fmtRelativo } from '@/lib/format';
import type { Grupo, Host } from '@/lib/types';

type Workspace = { id: number; name: string; hosts: number };
type Resumo = Record<HostSituacao, number>;

export default function HostsPage() {
  const [aba, setAba] = useState<string | null>('hosts');
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [subredeFiltro, setSubredeFiltro] = useState<string | null>(null);
  const { data: workspaces = [] } = useQuery({ queryKey: ['workspaces'], queryFn: () => api<Workspace[]>('/api/msf/workspaces') });

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={3}>Hosts descobertos (msf)</Title>
        <Select
          w={260}
          placeholder="Todos os workspaces"
          clearable
          data={workspaces.map((w) => ({ value: String(w.id), label: `${w.name} (${w.hosts} hosts)` }))}
          value={workspaceId}
          onChange={setWorkspaceId}
        />
      </Group>
      <Tabs value={aba} onChange={setAba} keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="hosts">Hosts</Tabs.Tab>
          <Tabs.Tab value="subredes">Sub-redes (IPDiscover)</Tabs.Tab>
          <Tabs.Tab value="dispositivos">Dispositivos identificados</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="hosts" pt="md">
          <ListaHosts workspaceId={workspaceId} workspaces={workspaces} subrede={subredeFiltro} setSubrede={setSubredeFiltro} />
        </Tabs.Panel>
        <Tabs.Panel value="subredes" pt="md">
          <PainelSubredes
            workspaceId={workspaceId}
            onAbrir={(s) => {
              setSubredeFiltro(s);
              setAba('hosts');
            }}
          />
        </Tabs.Panel>
        <Tabs.Panel value="dispositivos" pt="md">
          <Dispositivos />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

// ------------------------------------------------------------------------------------------------ lista

function ListaHosts({
  workspaceId,
  workspaces,
  subrede,
  setSubrede,
}: {
  workspaceId: string | null;
  workspaces: Workspace[];
  subrede: string | null;
  setSubrede: (s: string | null) => void;
}) {
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const [q] = useDebouncedValue(busca, 300);
  const [situacao, setSituacao] = useState<string[]>([]);
  const [grupoId, setGrupoId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [ordenacao, setOrdenacao] = useState<Ordenacao>({ campo: 'address', dir: 'asc' });
  const [selecao, setSelecao] = useState<RowSelectionState>({});
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({});
  const [clonar, setClonar] = useState<Host[]>([]);
  const [classificar, setClassificar] = useState<{ hosts: Host[]; tipo: 'conhecido' | 'ignorado' } | null>(null);
  const [importar, setImportar] = useState<{ hostIds?: number[] } | null>(null);

  const params = { workspaceId, q, situacao, subrede, grupoId, page, pageSize, sort: ordenacao?.campo, dir: ordenacao?.dir };
  const { data, isFetching } = useQuery({
    queryKey: ['hosts', params],
    queryFn: () => api<Pagina<Host> & { resumo: Resumo }>(`/api/msf/hosts${qs(params)}`),
    placeholderData: (prev) => prev,
  });
  const { data: subredes = [] } = useQuery({
    queryKey: ['subredes', workspaceId],
    queryFn: () => api<{ subrede: string }[]>(`/api/msf/subredes${qs({ workspaceId })}`),
  });
  const { data: grupos = [] } = useQuery({ queryKey: ['grupos'], queryFn: () => api<Grupo[]>('/api/grupos') });

  // a seleção guarda os hosts (não só ids) para sobreviver à troca de página
  const [selecionados, setSelecionados] = useState<Record<string, Host>>({});
  const onSelecao = (s: RowSelectionState) => {
    setSelecao(s);
    setSelecionados((prev) => {
      const out: Record<string, Host> = {};
      for (const id of Object.keys(s)) out[id] = prev[id] ?? data!.dados.find((h) => String(h.id) === id)!;
      return out;
    });
  };
  const lista = Object.values(selecionados).filter(Boolean);
  const limparSelecao = () => {
    setSelecao({});
    setSelecionados({});
  };

  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  const atualizarVisto = async () => {
    try {
      const r = await api<{ itens: number; encontrados: number }>('/api/msf/ultimo-visto', { method: 'POST' });
      notifications.show({ color: 'teal', message: `Último visto atualizado em ${r.encontrados} de ${r.itens} itens` });
      qc.invalidateQueries({ queryKey: ['itens'] });
    } catch (e) {
      notifications.show({ color: 'red', message: mensagemErro(e) });
    }
  };

  const columns = useMemo<ColumnDef<Host>[]>(
    () => [
      {
        id: 'exp',
        size: 28,
        enableSorting: false,
        header: '',
        cell: ({ row }) => (
          <ActionIcon
            size="sm"
            variant="subtle"
            aria-label="Expandir"
            onClick={(e) => {
              e.stopPropagation();
              setExpandidos((x) => ({ ...x, [row.id]: !x[row.id] }));
            }}
          >
            {expandidos[row.id] ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
          </ActionIcon>
        ),
      },
      {
        id: 'situacao',
        header: 'Situação',
        enableSorting: false,
        cell: ({ row: { original: h } }) => (
          <Group gap={4} wrap="nowrap">
            <Badge size="sm" variant="light" color={SITUACAO_COLOR[h.situacao]}>
              {SITUACAO_LABEL[h.situacao]}
            </Badge>
            {h.itemId && (
              <Anchor component={Link} href={`/inventario/${h.itemId}`} size="xs" onClick={(e) => e.stopPropagation()}>
                {h.patrimonio}
              </Anchor>
            )}
            {h.dispositivo?.tipo && (
              <Text size="xs" c="dimmed">
                {h.dispositivo.tipo}
              </Text>
            )}
          </Group>
        ),
      },
      { id: 'address', header: 'IP', cell: ({ row }) => <span className="mono">{row.original.address}</span> },
      { id: 'mac', header: 'MAC', cell: ({ row }) => <span className="mono">{row.original.mac ?? '—'}</span> },
      { id: 'name', header: 'Hostname', cell: ({ row }) => row.original.name ?? '—' },
      {
        id: 'os_name',
        header: 'SO',
        cell: ({ row: { original: h } }) => [h.os_name, h.os_flavor, h.os_sp].filter(Boolean).join(' ') || '—',
      },
      {
        id: 'state',
        header: 'Estado',
        cell: ({ row }) => (
          <Badge size="xs" variant="dot" color={row.original.state === 'alive' ? 'teal' : 'gray'}>
            {row.original.state ?? '?'}
          </Badge>
        ),
      },
      { id: 'servicos', header: 'Portas', enableSorting: false, cell: ({ row }) => row.original.servicos },
      { id: 'workspace', header: 'Workspace', cell: ({ row }) => row.original.workspace },
      {
        id: 'updated_at',
        header: 'Visto',
        cell: ({ row }) => (
          <Tooltip label={fmtDataHora(row.original.updated_at)}>
            <Text size="xs">{fmtRelativo(row.original.updated_at)}</Text>
          </Tooltip>
        ),
      },
      {
        id: 'acoes',
        header: '',
        enableSorting: false,
        cell: ({ row: { original: h } }) => (
          <Group gap={4} wrap="nowrap" justify="flex-end" onClick={(e) => e.stopPropagation()}>
            {h.situacao !== 'inventariado' && (
              <Button size="compact-xs" leftSection={<IconPlus size={14} />} onClick={() => setClonar([h])}>
                Adicionar
              </Button>
            )}
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <ActionIcon variant="subtle" size="sm" aria-label="Mais ações">
                  <IconDots size={16} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconRouter size={14} />} onClick={() => setClassificar({ hosts: [h], tipo: 'conhecido' })}>
                  Dispositivo de rede conhecido…
                </Menu.Item>
                <Menu.Item leftSection={<IconEyeOff size={14} />} onClick={() => setClassificar({ hosts: [h], tipo: 'ignorado' })}>
                  Ignorar…
                </Menu.Item>
                {h.situacao === 'inventariado' && (
                  <Menu.Item leftSection={<IconPlus size={14} />} onClick={() => setClonar([h])}>
                    Adicionar novamente (duplicar)
                  </Menu.Item>
                )}
              </Menu.Dropdown>
            </Menu>
          </Group>
        ),
      },
    ],
    [expandidos],
  );

  const r = data?.resumo;

  return (
    <Stack>
      {r && (
        <Group gap="xs">
          {(Object.keys(SITUACAO_LABEL) as HostSituacao[]).map((s) => (
            <Badge
              key={s}
              size="lg"
              variant={situacao.includes(s) ? 'filled' : 'light'}
              color={SITUACAO_COLOR[s]}
              style={{ cursor: 'pointer' }}
              onClick={() => reset(setSituacao)(situacao.includes(s) ? situacao.filter((x) => x !== s) : [...situacao, s])}
            >
              {SITUACAO_LABEL[s]}: {r[s]}
            </Badge>
          ))}
        </Group>
      )}

      <Group align="flex-end" gap="sm">
        <TextInput
          leftSection={<IconSearch size={16} />}
          placeholder="IP, MAC, hostname ou SO"
          value={busca}
          onChange={(e) => reset(setBusca)(e.currentTarget.value)}
          w={260}
        />
        <MultiSelect
          placeholder="Situação"
          data={(Object.keys(SITUACAO_LABEL) as HostSituacao[]).map((s) => ({ value: s, label: SITUACAO_LABEL[s] }))}
          value={situacao}
          onChange={reset(setSituacao)}
          clearable
          w={260}
        />
        <Select
          placeholder="Sub-rede"
          clearable
          searchable
          data={subredes.map((s) => s.subrede)}
          value={subrede}
          onChange={reset(setSubrede)}
          w={180}
        />
        <Select
          placeholder="Grupo"
          clearable
          data={grupos.map((g) => ({ value: String(g.id), label: g.nome }))}
          value={grupoId}
          onChange={reset(setGrupoId)}
          w={180}
        />
        <Group gap="xs" ml="auto">
          <Tooltip label="Atualiza o “último visto” dos itens do inventário a partir do msf">
            <Button variant="default" leftSection={<IconRefresh size={16} />} onClick={atualizarVisto}>
              Último visto
            </Button>
          </Tooltip>
          <Button leftSection={<IconDatabaseImport size={16} />} onClick={() => setImportar({})}>
            Importação em massa
          </Button>
        </Group>
      </Group>

      {lista.length > 0 && (
        <Card withBorder p="xs">
          <Group gap="xs">
            <Text size="sm" fw={600}>
              {lista.length} selecionado(s):
            </Text>
            <Button size="xs" onClick={() => setClonar(lista)}>
              Adicionar com formulário (um a um)
            </Button>
            <Button size="xs" variant="light" onClick={() => setImportar({ hostIds: lista.map((h) => h.id) })}>
              Importar com patrimônio provisório
            </Button>
            <Button size="xs" variant="default" onClick={() => setClassificar({ hosts: lista, tipo: 'conhecido' })}>
              Marcar como conhecidos
            </Button>
            <Button size="xs" variant="default" onClick={() => setClassificar({ hosts: lista, tipo: 'ignorado' })}>
              Ignorar
            </Button>
            <Button size="xs" variant="subtle" color="gray" onClick={limparSelecao}>
              Limpar seleção
            </Button>
          </Group>
        </Card>
      )}

      <DataTable
        data={data?.dados ?? []}
        columns={columns}
        getRowId={(h) => String(h.id)}
        loading={isFetching}
        total={data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        onPage={setPage}
        onPageSize={reset(setPageSize)}
        ordenacao={ordenacao}
        onOrdenar={reset(setOrdenacao)}
        selecao={selecao}
        onSelecao={onSelecao}
        expandidos={expandidos}
        renderExpandido={(h) => <HostDetalhe hostId={h.id} />}
        onRowClick={(h) => setExpandidos((x) => ({ ...x, [h.id]: !x[h.id] }))}
        vazio="Nenhum host encontrado. Rode db_nmap no Kali ou ajuste os filtros."
      />

      {clonar.length > 0 && (
        <ClonarModal
          hosts={clonar}
          onClose={() => {
            setClonar([]);
            limparSelecao();
          }}
        />
      )}
      {classificar && (
        <ClassificarModal
          hosts={classificar.hosts}
          inicial={classificar.tipo}
          onClose={() => {
            setClassificar(null);
            limparSelecao();
          }}
        />
      )}
      {importar && (
        <ImportacaoMassaModal
          opened
          onClose={() => {
            setImportar(null);
            limparSelecao();
          }}
          workspaces={workspaces}
          workspaceId={workspaceId}
          hostIds={importar.hostIds}
        />
      )}
    </Stack>
  );
}

// ------------------------------------------------------------------------------------------------ sub-redes

type LinhaSubrede = {
  subrede: string;
  total: number;
  inventariados: number;
  provaveis: number;
  identificados: number;
  ignorados: number;
  desconhecidos: number;
  ultimoVisto: string | null;
};

function PainelSubredes({ workspaceId, onAbrir }: { workspaceId: string | null; onAbrir: (s: string) => void }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['subredes', workspaceId],
    queryFn: () => api<LinhaSubrede[]>(`/api/msf/subredes${qs({ workspaceId })}`),
  });
  const tot = data.reduce(
    (a, s) => ({
      total: a.total + s.total,
      inv: a.inv + s.inventariados,
      idf: a.idf + s.identificados + s.ignorados,
      desc: a.desc + s.desconhecidos + s.provaveis,
    }),
    { total: 0, inv: 0, idf: 0, desc: 0 },
  );
  const pct = (n: number, t: number) => (t ? (n / t) * 100 : 0);

  return (
    <Stack>
      <SimpleGrid cols={{ base: 2, sm: 4 }}>
        {[
          ['Hosts vistos', tot.total, 'indigo'],
          ['Inventariados', tot.inv, 'teal'],
          ['Identificados / ignorados', tot.idf, 'blue'],
          ['Não identificados', tot.desc, 'orange'],
        ].map(([l, v, c]) => (
          <Card key={l as string} withBorder>
            <Text size="xs" c="dimmed">
              {l}
            </Text>
            <Text size="xl" fw={700} c={c as string}>
              {v}
            </Text>
          </Card>
        ))}
      </SimpleGrid>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Sub-rede</Table.Th>
            <Table.Th>Vistos</Table.Th>
            <Table.Th>Inventariados</Table.Th>
            <Table.Th>Identificados</Table.Th>
            <Table.Th>Ignorados</Table.Th>
            <Table.Th>Não identificados</Table.Th>
            <Table.Th w={220}>Cobertura</Table.Th>
            <Table.Th>Último scan</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {isLoading && (
            <Table.Tr>
              <Table.Td colSpan={8}>Carregando…</Table.Td>
            </Table.Tr>
          )}
          {data.map((s) => (
            <Table.Tr key={s.subrede} className="linha-clicavel" onClick={() => onAbrir(s.subrede)}>
              <Table.Td className="mono">{s.subrede}</Table.Td>
              <Table.Td>{s.total}</Table.Td>
              <Table.Td>{s.inventariados}</Table.Td>
              <Table.Td>{s.identificados}</Table.Td>
              <Table.Td>{s.ignorados}</Table.Td>
              <Table.Td>
                <Text c={s.desconhecidos + s.provaveis ? 'orange' : undefined} fw={s.desconhecidos ? 700 : undefined} size="sm">
                  {s.desconhecidos + s.provaveis}
                </Text>
              </Table.Td>
              <Table.Td>
                <Progress.Root size="lg">
                  <Progress.Section value={pct(s.inventariados, s.total)} color="teal" />
                  <Progress.Section value={pct(s.identificados + s.ignorados, s.total)} color="blue" />
                  <Progress.Section value={pct(s.desconhecidos + s.provaveis, s.total)} color="orange" />
                </Progress.Root>
              </Table.Td>
              <Table.Td>{fmtRelativo(s.ultimoVisto)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

// ------------------------------------------------------------------------------------------------ dispositivos identificados

type Dispositivo = { id: number; mac: string | null; ip: string | null; classificacao: string; tipo: string | null; descricao: string | null; usuario: string; updatedAt: string };

function Dispositivos() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ['dispositivos'], queryFn: () => api<Dispositivo[]>('/api/msf/dispositivos') });
  const remover = (d: Dispositivo) =>
    modals.openConfirmModal({
      title: 'Remover classificação',
      children: <Text size="sm">O host {d.mac ?? d.ip} voltará a aparecer como não identificado.</Text>,
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        await api(`/api/msf/dispositivos/${d.id}`, { method: 'DELETE' });
        qc.invalidateQueries({ queryKey: ['dispositivos'] });
        qc.invalidateQueries({ queryKey: ['hosts'] });
      },
    });
  return (
    <Table striped>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Classificação</Table.Th>
          <Table.Th>MAC</Table.Th>
          <Table.Th>IP</Table.Th>
          <Table.Th>Tipo</Table.Th>
          <Table.Th>Descrição</Table.Th>
          <Table.Th>Por</Table.Th>
          <Table.Th>Em</Table.Th>
          <Table.Th />
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {!data.length && (
          <Table.Tr>
            <Table.Td colSpan={8}>
              <Text c="dimmed" size="sm" ta="center" p="md">
                Nenhum dispositivo classificado ainda.
              </Text>
            </Table.Td>
          </Table.Tr>
        )}
        {data.map((d) => (
          <Table.Tr key={d.id}>
            <Table.Td>
              <Badge variant="light" color={d.classificacao === 'conhecido' ? 'blue' : 'gray'}>
                {d.classificacao}
              </Badge>
            </Table.Td>
            <Table.Td className="mono">{d.mac ?? '—'}</Table.Td>
            <Table.Td className="mono">{d.ip ?? '—'}</Table.Td>
            <Table.Td>{d.tipo}</Table.Td>
            <Table.Td>{d.descricao}</Table.Td>
            <Table.Td>{d.usuario}</Table.Td>
            <Table.Td>{fmtDataHora(d.updatedAt)}</Table.Td>
            <Table.Td>
              <ActionIcon variant="subtle" color="red" onClick={() => remover(d)} aria-label="Remover">
                <IconTrash size={16} />
              </ActionIcon>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
