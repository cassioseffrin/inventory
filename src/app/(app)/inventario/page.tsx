'use client';

import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconDownload, IconEdit, IconPlus, IconRefresh, IconSearch, IconTrash } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { DataTable, type Ordenacao } from '@/components/DataTable';
import { FuncionarioSelect } from '@/components/FuncionarioSelect';
import { ItemForm, VAZIO, itemParaForm } from '@/components/ItemForm';
import { SyncModal } from '@/components/item/SyncModal';
import { api, mensagemErro, qs, type Pagina } from '@/lib/api';
import { STATUS, STATUS_COLOR, STATUS_LABEL, TIPOS, TIPO_LABEL } from '@/lib/constants';
import { diasDesde, fmtDataHora, fmtRelativo } from '@/lib/format';
import type { Grupo, Item, ItemDetalhe } from '@/lib/types';

export default function InventarioPage() {
  return (
    <Suspense>
      <Inventario />
    </Suspense>
  );
}

function Inventario() {
  const router = useRouter();
  const sp = useSearchParams();
  const qc = useQueryClient();

  // filtros iniciais podem vir da URL (links do dashboard / ficha do funcionário)
  const [busca, setBusca] = useState(sp.get('q') ?? '');
  const [q] = useDebouncedValue(busca, 300);
  const [funcionarioId, setFuncionarioId] = useState<number | null>(sp.get('funcionarioId') ? Number(sp.get('funcionarioId')) : null);
  const [setor, setSetor] = useState<string | null>(sp.get('setor'));
  const [status, setStatus] = useState<string | null>(sp.get('status'));
  const [tipo, setTipo] = useState<string | null>(sp.get('tipo'));
  const [tag, setTag] = useState<string | null>(sp.get('tag'));
  const [grupoId, setGrupoId] = useState<string | null>(sp.get('grupoId'));
  const [naoVistoDias, setNaoVistoDias] = useState<number | ''>(sp.get('naoVistoDias') ? Number(sp.get('naoVistoDias')) : '');
  const [semResponsavel, setSemResponsavel] = useState(sp.get('semResponsavel') === 'true');
  const [provisorio, setProvisorio] = useState(sp.get('provisorio') === 'true');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [ordenacao, setOrdenacao] = useState<Ordenacao>({ campo: 'numeroPatrimonio', dir: 'asc' });
  const [selecao, setSelecao] = useState<RowSelectionState>({});
  const [editar, setEditar] = useState<ItemDetalhe | 'novo' | null>(null);
  const [syncId, setSyncId] = useState<number | null>(null);
  const [grupoDestino, setGrupoDestino] = useState<string | null>(null);

  const filtros = {
    q,
    funcionarioId,
    setor,
    status,
    tipo,
    tag,
    grupoId,
    naoVistoDias,
    semResponsavel: semResponsavel || undefined,
    provisorio: provisorio || undefined,
  };
  const params = { ...filtros, page, pageSize, sort: ordenacao?.campo, dir: ordenacao?.dir };

  const { data, isFetching } = useQuery({
    queryKey: ['itens', params],
    queryFn: () => api<Pagina<Item>>(`/api/itens${qs(params)}`),
    placeholderData: (p) => p,
  });
  const { data: opcoes } = useQuery({ queryKey: ['itens-opcoes'], queryFn: () => api<Record<string, string[]>>('/api/itens/opcoes') });
  const { data: grupos = [] } = useQuery({ queryKey: ['grupos'], queryFn: () => api<Grupo[]>('/api/grupos') });

  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  const abrirEdicao = async (id: number) => {
    try {
      setEditar(await api<ItemDetalhe>(`/api/itens/${id}`));
    } catch (e) {
      notifications.show({ color: 'red', message: mensagemErro(e) });
    }
  };

  const excluir = (i: Item) =>
    modals.openConfirmModal({
      title: `Excluir ${i.numeroPatrimonio}?`,
      children: <Text size="sm">O item será removido do inventário. O histórico de auditoria é preservado.</Text>,
      labels: { confirm: 'Excluir', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await api(`/api/itens/${i.id}`, { method: 'DELETE' });
          qc.invalidateQueries({ queryKey: ['itens'] });
          qc.invalidateQueries({ queryKey: ['hosts'] });
          notifications.show({ color: 'teal', message: 'Item excluído' });
        } catch (e) {
          notifications.show({ color: 'red', message: mensagemErro(e) });
        }
      },
    });

  const adicionarAoGrupo = async () => {
    try {
      await api(`/api/grupos/${grupoDestino}/itens`, { method: 'POST', json: { itemIds: Object.keys(selecao).map(Number) } });
      notifications.show({ color: 'teal', message: 'Itens adicionados ao grupo' });
      setSelecao({});
      setGrupoDestino(null);
      qc.invalidateQueries({ queryKey: ['grupos'] });
    } catch (e) {
      notifications.show({ color: 'red', message: mensagemErro(e) });
    }
  };

  const columns = useMemo<ColumnDef<Item>[]>(
    () => [
      {
        id: 'numeroPatrimonio',
        header: 'Patrimônio',
        cell: ({ row: { original: i } }) => (
          <Group gap={4} wrap="nowrap">
            <Anchor component={Link} href={`/inventario/${i.id}`} fw={600} size="sm" onClick={(e) => e.stopPropagation()}>
              {i.numeroPatrimonio}
            </Anchor>
            {i.patrimonioProvisorio && (
              <Badge size="xs" color="orange" variant="light">
                provisório
              </Badge>
            )}
          </Group>
        ),
      },
      { id: 'tipo', header: 'Tipo', cell: ({ row }) => TIPO_LABEL[row.original.tipo] },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge size="sm" variant="light" color={STATUS_COLOR[row.original.status]}>
            {STATUS_LABEL[row.original.status]}
          </Badge>
        ),
      },
      { id: 'hostname', header: 'Hostname', cell: ({ row }) => row.original.hostname ?? '—' },
      { id: 'ip', header: 'IP', cell: ({ row }) => <span className="mono">{row.original.ip ?? '—'}</span> },
      { id: 'mac', header: 'MAC', cell: ({ row }) => <span className="mono">{row.original.mac ?? '—'}</span> },
      { id: 'osName', header: 'SO', cell: ({ row }) => row.original.osName ?? '—' },
      {
        id: 'funcionarioNome',
        header: 'Responsável',
        cell: ({ row }) =>
          row.original.funcionarioId ? (
            <Anchor component={Link} href={`/funcionarios/${row.original.funcionarioId}`} size="sm" onClick={(e) => e.stopPropagation()}>
              {row.original.funcionarioNome}
            </Anchor>
          ) : (
            <Text size="sm" c="dimmed">
              —
            </Text>
          ),
      },
      { id: 'setor', header: 'Setor', cell: ({ row }) => row.original.setor ?? '—' },
      { id: 'localizacao', header: 'Localização', cell: ({ row }) => row.original.localizacao ?? '—' },
      { id: 'tag', header: 'TAG', cell: ({ row }) => row.original.tag ?? '' },
      {
        id: 'ultimoVistoMsf',
        header: 'Visto (msf)',
        cell: ({ row }) => {
          const d = diasDesde(row.original.ultimoVistoMsf);
          return (
            <Tooltip label={fmtDataHora(row.original.ultimoVistoMsf)}>
              <Text size="xs" c={d === null || d > 30 ? 'red' : undefined}>
                {fmtRelativo(row.original.ultimoVistoMsf)}
              </Text>
            </Tooltip>
          );
        },
      },
      {
        id: 'acoes',
        header: '',
        enableSorting: false,
        cell: ({ row: { original: i } }) => (
          <Group gap={2} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
            <Tooltip label="Editar">
              <ActionIcon variant="subtle" size="sm" onClick={() => abrirEdicao(i.id)} aria-label="Editar">
                <IconEdit size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Sincronizar com msf">
              <ActionIcon variant="subtle" size="sm" onClick={() => setSyncId(i.id)} aria-label="Sincronizar">
                <IconRefresh size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Excluir">
              <ActionIcon variant="subtle" size="sm" color="red" onClick={() => excluir(i)} aria-label="Excluir">
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const nSel = Object.keys(selecao).length;

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={3}>Inventário</Title>
        <Group gap="xs">
          <Button
            component="a"
            href={`/api/itens/export${qs(filtros)}`}
            variant="default"
            leftSection={<IconDownload size={16} />}
          >
            Exportar CSV
          </Button>
          <Button leftSection={<IconPlus size={16} />} onClick={() => setEditar('novo')}>
            Novo item
          </Button>
        </Group>
      </Group>

      <Card withBorder p="sm">
        <Group align="flex-end" gap="sm">
          <TextInput
            label="Busca"
            leftSection={<IconSearch size={16} />}
            placeholder="patrimônio, hostname, IP, MAC, série…"
            value={busca}
            onChange={(e) => reset(setBusca)(e.currentTarget.value)}
            w={260}
          />
          <FuncionarioSelect label="Responsável" value={funcionarioId} onChange={reset(setFuncionarioId)} w={240} />
          <Select label="Setor" clearable searchable data={opcoes?.setor ?? []} value={setor} onChange={reset(setSetor)} w={160} />
          <Select
            label="Status"
            clearable
            data={STATUS.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
            value={status}
            onChange={reset(setStatus)}
            w={140}
          />
          <Select label="Tipo" clearable data={TIPOS.map((t) => ({ value: t, label: TIPO_LABEL[t] }))} value={tipo} onChange={reset(setTipo)} w={140} />
          <Select label="TAG" clearable searchable data={opcoes?.tag ?? []} value={tag} onChange={reset(setTag)} w={150} />
          <Select
            label="Grupo"
            clearable
            data={grupos.map((g) => ({ value: String(g.id), label: `${g.nome}${g.tipo === 'dinamico' ? ' ⚡' : ''}` }))}
            value={grupoId}
            onChange={reset(setGrupoId)}
            w={180}
          />
          <NumberInput label="Não visto há (dias)" min={1} value={naoVistoDias} onChange={(v) => reset(setNaoVistoDias)(v === '' ? '' : Number(v))} w={140} />
          <Stack gap={4}>
            <Checkbox label="Sem responsável" checked={semResponsavel} onChange={(e) => reset(setSemResponsavel)(e.currentTarget.checked)} />
            <Checkbox label="Patrimônio provisório" checked={provisorio} onChange={(e) => reset(setProvisorio)(e.currentTarget.checked)} />
          </Stack>
        </Group>
      </Card>

      {nSel > 0 && (
        <Card withBorder p="xs">
          <Group gap="xs">
            <Text size="sm" fw={600}>
              {nSel} selecionado(s)
            </Text>
            <Select
              size="xs"
              placeholder="Grupo estático"
              data={grupos.filter((g) => g.tipo === 'estatico').map((g) => ({ value: String(g.id), label: g.nome }))}
              value={grupoDestino}
              onChange={setGrupoDestino}
              w={200}
            />
            <Button size="xs" disabled={!grupoDestino} onClick={adicionarAoGrupo}>
              Adicionar ao grupo
            </Button>
            <Button size="xs" variant="subtle" color="gray" onClick={() => setSelecao({})}>
              Limpar
            </Button>
          </Group>
        </Card>
      )}

      <DataTable
        data={data?.dados ?? []}
        columns={columns}
        getRowId={(i) => String(i.id)}
        loading={isFetching}
        total={data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        onPage={setPage}
        onPageSize={reset(setPageSize)}
        ordenacao={ordenacao}
        onOrdenar={reset(setOrdenacao)}
        selecao={selecao}
        onSelecao={setSelecao}
        onRowClick={(i) => router.push(`/inventario/${i.id}`)}
        vazio="Nenhum item. Adicione hosts a partir da tela “Hosts descobertos”."
      />

      <Modal
        opened={!!editar}
        onClose={() => setEditar(null)}
        size="xl"
        title={editar === 'novo' ? 'Novo item' : editar ? `Editar ${editar.numeroPatrimonio}` : ''}
      >
        {editar && (
          <ItemForm
            inicial={editar === 'novo' ? VAZIO : itemParaForm(editar)}
            itemId={editar === 'novo' ? undefined : editar.id}
            funcionarioNome={editar === 'novo' ? null : editar.funcionarioNome}
            onSalvo={() => setEditar(null)}
            onCancelar={() => setEditar(null)}
          />
        )}
      </Modal>
      <SyncModal itemId={syncId} onClose={() => setSyncId(null)} />
    </Stack>
  );
}
