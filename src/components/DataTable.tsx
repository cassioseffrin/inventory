'use client';

import { Box, Center, Checkbox, Group, Loader, Pagination, Select, Table, Text, UnstyledButton } from '@mantine/core';
import { IconChevronDown, IconChevronUp, IconSelector } from '@tabler/icons-react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table';
import { Fragment, useMemo, type ReactNode } from 'react';

export type Ordenacao = { campo: string; dir: 'asc' | 'desc' } | null;

type Props<T> = {
  data: T[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[];
  getRowId: (row: T) => string;
  loading?: boolean;
  /** paginação no servidor */
  total?: number;
  page?: number;
  pageSize?: number;
  onPage?: (p: number) => void;
  onPageSize?: (n: number) => void;
  /** ordenação no servidor (column id = campo) */
  ordenacao?: Ordenacao;
  onOrdenar?: (o: Ordenacao) => void;
  /** seleção de linhas */
  selecao?: RowSelectionState;
  onSelecao?: (s: RowSelectionState) => void;
  podeSelecionar?: (row: T) => boolean;
  /** conteúdo exibido abaixo da linha quando ela está expandida */
  expandidos?: Record<string, boolean>;
  renderExpandido?: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  vazio?: string;
};

export function DataTable<T>(p: Props<T>) {
  const sorting: SortingState = p.ordenacao ? [{ id: p.ordenacao.campo, desc: p.ordenacao.dir === 'desc' }] : [];

  const columns = useMemo(() => {
    if (!p.onSelecao) return p.columns;
    const sel: ColumnDef<T> = {
      id: '__sel',
      enableSorting: false,
      size: 36,
      header: ({ table }) => (
        <Checkbox
          aria-label="Selecionar página"
          checked={table.getIsAllRowsSelected()}
          indeterminate={table.getIsSomeRowsSelected()}
          onChange={table.getToggleAllRowsSelectedHandler()}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label="Selecionar"
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onChange={row.getToggleSelectedHandler()}
          onClick={(e) => e.stopPropagation()}
        />
      ),
    };
    return [sel, ...p.columns];
  }, [p.columns, p.onSelecao]);

  const table = useReactTable({
    data: p.data,
    columns,
    getRowId: p.getRowId,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    enableRowSelection: p.podeSelecionar ? (row) => p.podeSelecionar!(row.original) : !!p.onSelecao,
    state: { sorting, rowSelection: p.selecao ?? {} },
    onSortingChange: (up) => {
      const next = typeof up === 'function' ? up(sorting) : up;
      p.onOrdenar?.(next[0] ? { campo: next[0].id, dir: next[0].desc ? 'desc' : 'asc' } : null);
    },
    onRowSelectionChange: (up) => p.onSelecao?.(typeof up === 'function' ? up(p.selecao ?? {}) : up),
  });

  const paginas = p.total !== undefined && p.pageSize ? Math.max(1, Math.ceil(p.total / p.pageSize)) : 1;
  const nCols = table.getVisibleLeafColumns().length;

  return (
    <Box>
      <Box className="tabela-wrap">
        <Table striped highlightOnHover verticalSpacing={6} fz="sm">
          <Table.Thead>
            {table.getHeaderGroups().map((hg) => (
              <Table.Tr key={hg.id}>
                {hg.headers.map((h) => {
                  const podeOrdenar = !!p.onOrdenar && h.column.getCanSort();
                  const dir = h.column.getIsSorted();
                  const label = h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext());
                  return (
                    <Table.Th key={h.id} style={{ width: h.column.columnDef.size ? h.getSize() : undefined, whiteSpace: 'nowrap' }}>
                      {podeOrdenar ? (
                        <UnstyledButton onClick={h.column.getToggleSortingHandler()} fw={600} fz="sm">
                          <Group gap={4} wrap="nowrap">
                            {label}
                            {dir === 'asc' ? <IconChevronUp size={14} /> : dir === 'desc' ? <IconChevronDown size={14} /> : <IconSelector size={14} opacity={0.4} />}
                          </Group>
                        </UnstyledButton>
                      ) : (
                        label
                      )}
                    </Table.Th>
                  );
                })}
              </Table.Tr>
            ))}
          </Table.Thead>
          <Table.Tbody>
            {p.loading && !p.data.length ? (
              <Table.Tr>
                <Table.Td colSpan={nCols}>
                  <Center p="lg">
                    <Loader size="sm" />
                  </Center>
                </Table.Td>
              </Table.Tr>
            ) : !p.data.length ? (
              <Table.Tr>
                <Table.Td colSpan={nCols}>
                  <Text c="dimmed" ta="center" p="lg" size="sm">
                    {p.vazio ?? 'Nenhum registro encontrado'}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <Fragment key={row.id}>
                  <Table.Tr
                    className={p.onRowClick ? 'linha-clicavel' : undefined}
                    onClick={p.onRowClick ? () => p.onRowClick!(row.original) : undefined}
                    bg={row.getIsSelected() ? 'var(--mantine-primary-color-light)' : undefined}
                  >
                    {row.getVisibleCells().map((c) => (
                      <Table.Td key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</Table.Td>
                    ))}
                  </Table.Tr>
                  {p.renderExpandido && p.expandidos?.[row.id] && (
                    <Table.Tr>
                      <Table.Td colSpan={nCols} p={0}>
                        {p.renderExpandido(row.original)}
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Fragment>
              ))
            )}
          </Table.Tbody>
        </Table>
      </Box>
      {p.onPage && p.total !== undefined && (
        <Group justify="space-between" mt="sm" gap="xs">
          <Text size="sm" c="dimmed">
            {p.total} registro(s){p.loading ? ' — carregando…' : ''}
          </Text>
          <Group gap="xs">
            {p.onPageSize && (
              <Select
                size="xs"
                w={90}
                aria-label="Itens por página"
                data={['10', '25', '50', '100', '200']}
                value={String(p.pageSize)}
                onChange={(v) => v && p.onPageSize!(Number(v))}
                allowDeselect={false}
              />
            )}
            <Pagination size="sm" total={paginas} value={p.page} onChange={p.onPage} siblings={1} />
          </Group>
        </Group>
      )}
    </Box>
  );
}
