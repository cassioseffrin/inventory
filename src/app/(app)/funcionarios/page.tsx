'use client';

import { ActionIcon, Anchor, Badge, Button, Group, SegmentedControl, Select, Stack, Text, TextInput, Title, Tooltip } from '@mantine/core';
import { useDebouncedValue, useLocalStorage } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconBinaryTree, IconEdit, IconLink, IconList, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ArvoreFuncionarios } from '@/components/ArvoreFuncionarios';
import { AssociarItensModal } from '@/components/AssociarItensModal';
import { DataTable } from '@/components/DataTable';
import { FuncionarioModal } from '@/components/FuncionarioModal';
import { useSessao } from '@/components/useSessao';
import { api, mensagemErro, qs, type Pagina } from '@/lib/api';
import type { Funcionario } from '@/lib/types';

export default function FuncionariosPage() {
  const router = useRouter();
  const qc = useQueryClient();
  // gerente: a própria ficha não é acessível (ele só gerencia a equipe abaixo dele)
  const { data: sessao } = useSessao();
  const proprioId = sessao?.papel === 'admin' ? undefined : sessao?.funcionarioId;
  const [busca, setBusca] = useState('');
  const [q] = useDebouncedValue(busca, 300);
  const [ativo, setAtivo] = useState('true');
  const [modo, setModo] = useLocalStorage<'lista' | 'arvore'>({ key: 'funcionarios-modo', defaultValue: 'lista' });
  const [page, setPage] = useState(1);
  const [editar, setEditar] = useState<Funcionario | 'novo' | null>(null);
  const [associar, setAssociar] = useState<Funcionario | null>(null);
  // null = sem filtro; 'todos' = somente quem tem equipe; id = equipe daquele gerente
  const [gerente, setGerente] = useState<string | null>(null);
  const { data: gerentes = [] } = useQuery({
    queryKey: ['funcionarios', 'gerentes'],
    queryFn: () => api<{ id: number; nome: string; matricula: string; ativo: boolean; equipe: number }[]>('/api/funcionarios/gerentes'),
  });
  const params = {
    q,
    ativo: ativo === 'todos' ? undefined : ativo,
    soGerentes: gerente === 'todos' ? 'true' : undefined,
    gerenteId: gerente && gerente !== 'todos' ? gerente : undefined,
    page,
    pageSize: 25,
  };
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
            row.original.gerenteId === proprioId ? (
              <Text size="sm">{row.original.gerenteNome} (você)</Text>
            ) : (
              <Anchor component={Link} href={`/funcionarios/${row.original.gerenteId}`} size="sm" onClick={(e) => e.stopPropagation()}>
                {row.original.gerenteNome}
              </Anchor>
            )
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
    [qc, proprioId],
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
        <SegmentedControl
          value={modo}
          onChange={(v) => setModo(v as 'lista' | 'arvore')}
          data={[
            {
              value: 'lista',
              label: (
                <Group gap={4} wrap="nowrap">
                  <IconList size={14} /> Lista
                </Group>
              ),
            },
            {
              value: 'arvore',
              label: (
                <Group gap={4} wrap="nowrap">
                  <IconBinaryTree size={14} /> Árvore
                </Group>
              ),
            },
          ]}
        />
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
        {modo === 'lista' && (
          <Select
            placeholder="Gerente: todos"
            searchable
            clearable
            w={300}
            value={gerente}
            onChange={(v) => {
              setGerente(v);
              setPage(1);
            }}
            nothingFoundMessage="Nenhum gerente"
            data={[
              { value: 'todos', label: 'Somente gerentes' },
              ...gerentes.map((g) => ({
                value: String(g.id),
                label: `Equipe de ${g.nome} (${g.equipe})${g.ativo ? '' : ' [inativo]'}`,
              })),
            ]}
          />
        )}
      </Group>
      {modo === 'arvore' ? (
        <ArvoreFuncionarios busca={q} ativo={ativo as 'true' | 'false' | 'todos'} />
      ) : (
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
      )}
      <AssociarItensModal funcionario={associar} onClose={() => setAssociar(null)} />
      <FuncionarioModal inicial={editar} onClose={() => setEditar(null)} />
    </Stack>
  );
}
