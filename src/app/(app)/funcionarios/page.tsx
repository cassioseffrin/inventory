'use client';

import { ActionIcon, Anchor, Badge, Button, Group, SegmentedControl, Stack, Text, TextInput, Title, Tooltip } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconEdit, IconLink, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { AssociarItensModal } from '@/components/AssociarItensModal';
import { DataTable } from '@/components/DataTable';
import { FuncionarioModal } from '@/components/FuncionarioModal';
import { api, mensagemErro, qs, type Pagina } from '@/lib/api';
import type { Funcionario } from '@/lib/types';

export default function FuncionariosPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const [q] = useDebouncedValue(busca, 300);
  const [ativo, setAtivo] = useState('true');
  const [page, setPage] = useState(1);
  const [editar, setEditar] = useState<Funcionario | 'novo' | null>(null);
  const [associar, setAssociar] = useState<Funcionario | null>(null);
  const params = { q, ativo: ativo === 'todos' ? undefined : ativo, page, pageSize: 25 };
  const { data, isFetching } = useQuery({
    queryKey: ['funcionarios', params],
    queryFn: () => api<Pagina<Funcionario>>(`/api/funcionarios${qs(params)}`),
    placeholderData: (p) => p,
  });

  const columns = useMemo<ColumnDef<Funcionario>[]>(
    () => [
      {
        id: 'nome',
        header: 'Nome',
        cell: ({ row }) => (
          <Anchor component={Link} href={`/funcionarios/${row.original.id}`} size="sm" fw={600} onClick={(e) => e.stopPropagation()}>
            {row.original.nome}
          </Anchor>
        ),
      },
      { id: 'matricula', header: 'Matrícula', cell: ({ row }) => <span className="mono">{row.original.matricula}</span> },
      { id: 'email', header: 'E-mail', cell: ({ row }) => row.original.email ?? '—' },
      { id: 'setor', header: 'Setor', cell: ({ row }) => row.original.setor ?? '—' },
      {
        id: 'gerente',
        header: 'Gerente',
        cell: ({ row }) =>
          row.original.gerenteId ? (
            <Anchor component={Link} href={`/funcionarios/${row.original.gerenteId}`} size="sm" onClick={(e) => e.stopPropagation()}>
              {row.original.gerenteNome}
            </Anchor>
          ) : (
            '—'
          ),
      },
      { id: 'itens', header: 'Itens', cell: ({ row }) => row.original.itens },
      {
        id: 'ativo',
        header: 'Situação',
        cell: ({ row }) => (
          <Badge size="sm" variant="light" color={row.original.ativo ? 'teal' : 'gray'}>
            {row.original.ativo ? 'Ativo' : 'Inativo'}
          </Badge>
        ),
      },
      {
        id: 'acoes',
        header: '',
        cell: ({ row: { original: f } }) => (
          <Group gap={2} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
            <Tooltip label="Associar itens">
              <ActionIcon variant="subtle" size="sm" onClick={() => setAssociar(f)} aria-label="Associar itens">
                <IconLink size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Editar">
              <ActionIcon variant="subtle" size="sm" onClick={() => setEditar(f)} aria-label="Editar">
                <IconEdit size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Excluir">
              <ActionIcon
                variant="subtle"
                color="red"
                size="sm"
                aria-label="Excluir"
                onClick={() =>
                  modals.openConfirmModal({
                    title: `Excluir ${f.nome}?`,
                    children: (
                      <Text size="sm">
                        {f.itens ? `${f.itens} item(ns) ficarão sem responsável. ` : ''}Prefira inativar o funcionário para preservar o vínculo.
                      </Text>
                    ),
                    labels: { confirm: 'Excluir', cancel: 'Cancelar' },
                    confirmProps: { color: 'red' },
                    onConfirm: async () => {
                      try {
                        await api(`/api/funcionarios/${f.id}`, { method: 'DELETE' });
                        qc.invalidateQueries({ queryKey: ['funcionarios'] });
                      } catch (e) {
                        notifications.show({ color: 'red', message: mensagemErro(e) });
                      }
                    },
                  })
                }
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        ),
      },
    ],
    [qc],
  );

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={3}>Funcionários</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setEditar('novo')}>
          Novo funcionário
        </Button>
      </Group>
      <Group>
        <TextInput
          leftSection={<IconSearch size={16} />}
          placeholder="Nome, matrícula ou e-mail"
          value={busca}
          onChange={(e) => {
            setBusca(e.currentTarget.value);
            setPage(1);
          }}
          w={300}
        />
        <SegmentedControl
          value={ativo}
          onChange={(v) => {
            setAtivo(v);
            setPage(1);
          }}
          data={[
            { value: 'true', label: 'Ativos' },
            { value: 'false', label: 'Inativos' },
            { value: 'todos', label: 'Todos' },
          ]}
        />
      </Group>
      <DataTable
        data={data?.dados ?? []}
        columns={columns}
        getRowId={(f) => String(f.id)}
        loading={isFetching}
        total={data?.total ?? 0}
        page={page}
        pageSize={25}
        onPage={setPage}
        onRowClick={(f) => router.push(`/funcionarios/${f.id}`)}
      />
      <AssociarItensModal funcionario={associar} onClose={() => setAssociar(null)} />
      <FuncionarioModal inicial={editar} onClose={() => setEditar(null)} />
    </Stack>
  );
}
