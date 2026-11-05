'use client';

import { Alert, Anchor, Badge, Card, Group, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconAlertTriangle, IconSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { CATEGORIA_LABEL } from '@/lib/constants';

type Linha = {
  itemId: number;
  numeroPatrimonio: string;
  hostname: string | null;
  funcionarioNome: string | null;
  software: string;
  versao: string | null;
  editor: string | null;
  nomeCanonico: string | null;
  categoria: string | null;
};

/** Software para gerente/comum: o que está instalado nos itens que a pessoa enxerga (só leitura). */
export function MeusSoftwares() {
  const [filtro, setFiltro] = useState('');
  const { data = [], isLoading } = useQuery({
    queryKey: ['softwares', 'meus'],
    queryFn: () => api<Linha[]>('/api/softwares/meus'),
  });
  const f = filtro.trim().toLowerCase();
  const visiveis = f
    ? data.filter((s) =>
        `${s.software} ${s.editor ?? ''} ${s.nomeCanonico ?? ''} ${s.numeroPatrimonio} ${s.hostname ?? ''} ${s.funcionarioNome ?? ''}`
          .toLowerCase()
          .includes(f),
      )
    : data;
  const proibidos = data.filter((s) => s.categoria === 'proibido');
  const varios = new Set(data.map((s) => s.funcionarioNome)).size > 1;

  return (
    <Stack>
      <Title order={3}>Software</Title>
      {proibidos.length > 0 && (
        <Alert color="red" icon={<IconAlertTriangle size={18} />} title="Software proibido instalado">
          {[...new Set(proibidos.map((p) => `${p.nomeCanonico ?? p.software} (${p.numeroPatrimonio})`))].join(', ')}. Procure a equipe de TI.
        </Alert>
      )}
      <Card withBorder>
        <Group justify="space-between" mb="xs">
          <Text size="sm" c="dimmed">
            {isLoading ? 'Carregando…' : `${data.length} instalação(ões) nos seus itens${varios ? ' e da equipe' : ''}`}
          </Text>
          <TextInput
            size="xs"
            leftSection={<IconSearch size={14} />}
            placeholder="Filtrar"
            value={filtro}
            onChange={(e) => setFiltro(e.currentTarget.value)}
            w={240}
          />
        </Group>
        <Table fz="sm" striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Software</Table.Th>
              <Table.Th>Versão</Table.Th>
              <Table.Th>Editor</Table.Th>
              <Table.Th>Categoria</Table.Th>
              <Table.Th>Item</Table.Th>
              {varios && <Table.Th>Responsável</Table.Th>}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {visiveis.map((s, i) => (
              <Table.Tr key={`${s.itemId}-${i}`} bg={s.categoria === 'proibido' ? 'var(--mantine-color-red-light)' : undefined}>
                <Table.Td>{s.nomeCanonico ?? s.software}</Table.Td>
                <Table.Td>{s.versao}</Table.Td>
                <Table.Td>{s.editor}</Table.Td>
                <Table.Td>
                  {s.categoria ? (
                    <Badge size="xs" variant="light" color={s.categoria === 'proibido' ? 'red' : 'blue'}>
                      {CATEGORIA_LABEL[s.categoria as keyof typeof CATEGORIA_LABEL] ?? s.categoria}
                    </Badge>
                  ) : (
                    <Text size="xs" c="dimmed">
                      não classificado
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Anchor component={Link} href={`/inventario/${s.itemId}`} size="sm">
                    {s.numeroPatrimonio}
                  </Anchor>
                  {s.hostname && (
                    <Text span size="xs" c="dimmed">
                      {' '}
                      · {s.hostname}
                    </Text>
                  )}
                </Table.Td>
                {varios && <Table.Td>{s.funcionarioNome}</Table.Td>}
              </Table.Tr>
            ))}
            {!isLoading && !visiveis.length && (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <Text size="sm" c="dimmed">
                    Nenhum software encontrado.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Card>
    </Stack>
  );
}
