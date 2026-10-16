'use client';

import { Alert, Anchor, Badge, Button, Card, Center, Group, Loader, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { IconArrowLeft, IconEdit } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api, mensagemErro } from '@/lib/api';
import { mascaraCpf } from '@/lib/cpf';
import { STATUS_COLOR, STATUS_LABEL, TIPO_LABEL, type Status, type Tipo } from '@/lib/constants';
import type { Funcionario } from '@/lib/types';
import { FuncionarioModal } from '@/components/FuncionarioModal';

type Ficha = Omit<Funcionario, 'itens'> & {
  createdAt: string;
  itens: { id: number; numeroPatrimonio: string; hostname: string | null; ip: string | null; tipo: Tipo; status: Status; osName: string | null; localizacao: string | null }[];
};

export default function FuncionarioPage() {
  const { id } = useParams<{ id: string }>();
  const [editar, setEditar] = useState(false);
  const { data: f, isLoading, error } = useQuery({ queryKey: ['funcionario', id], queryFn: () => api<Ficha>(`/api/funcionarios/${id}`) });

  if (isLoading)
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  if (error || !f) return <Alert color="red">{mensagemErro(error)}</Alert>;

  return (
    <Stack>
      <Anchor component={Link} href="/funcionarios" size="sm">
        <Group gap={4}>
          <IconArrowLeft size={14} /> Funcionários
        </Group>
      </Anchor>
      <Group justify="space-between">
        <Group gap="xs">
          <Title order={3}>{f.nome}</Title>
          <Badge variant="light" color={f.ativo ? 'teal' : 'gray'}>
            {f.ativo ? 'Ativo' : 'Inativo'}
          </Badge>
        </Group>
        <Button leftSection={<IconEdit size={16} />} onClick={() => setEditar(true)}>
          Editar
        </Button>
      </Group>
      <Card withBorder>
        <SimpleGrid cols={{ base: 2, md: 4 }}>
          <div>
            <Text size="xs" c="dimmed">
              Matrícula
            </Text>
            <Text className="mono">{f.matricula}</Text>
          </div>
          <div>
            <Text size="xs" c="dimmed">
              E-mail
            </Text>
            <Text size="sm">{f.email ?? '—'}</Text>
          </div>
          <div>
            <Text size="xs" c="dimmed">
              Setor
            </Text>
            <Text size="sm">{f.setor ?? '—'}</Text>
          </div>
          <div>
            <Text size="xs" c="dimmed">
              CPF
            </Text>
            <Text className="mono">{f.cpf ? mascaraCpf(f.cpf) : '—'}</Text>
          </div>
          <div>
            <Text size="xs" c="dimmed">
              Ramal
            </Text>
            <Text size="sm">{f.ramal ?? '—'}</Text>
          </div>
          <div>
            <Text size="xs" c="dimmed">
              Celular
            </Text>
            <Text size="sm">{f.celular ?? '—'}</Text>
          </div>
          <div>
            <Text size="xs" c="dimmed">
              Itens sob responsabilidade
            </Text>
            <Text size="sm" fw={700}>
              {f.itens.length}
            </Text>
          </div>
        </SimpleGrid>
      </Card>
      <Card withBorder>
        <Title order={5} mb="sm">
          Itens associados
        </Title>
        {f.itens.length ? (
          <Table striped highlightOnHover fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Patrimônio</Table.Th>
                <Table.Th>Tipo</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Hostname</Table.Th>
                <Table.Th>IP</Table.Th>
                <Table.Th>SO</Table.Th>
                <Table.Th>Localização</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {f.itens.map((i) => (
                <Table.Tr key={i.id}>
                  <Table.Td>
                    <Anchor component={Link} href={`/inventario/${i.id}`} size="sm" fw={600}>
                      {i.numeroPatrimonio}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>{TIPO_LABEL[i.tipo]}</Table.Td>
                  <Table.Td>
                    <Badge size="sm" variant="light" color={STATUS_COLOR[i.status]}>
                      {STATUS_LABEL[i.status]}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{i.hostname ?? '—'}</Table.Td>
                  <Table.Td className="mono">{i.ip ?? '—'}</Table.Td>
                  <Table.Td>{i.osName ?? '—'}</Table.Td>
                  <Table.Td>{i.localizacao ?? '—'}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : (
          <Text c="dimmed" size="sm">
            Nenhum item associado.
          </Text>
        )}
      </Card>
      <FuncionarioModal inicial={editar ? { ...f, itens: f.itens.length } : null} onClose={() => setEditar(false)} />
    </Stack>
  );
}
