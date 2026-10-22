'use client';

import { ActionIcon, Alert, Anchor, Badge, Button, Card, Center, Checkbox, Group, Image, Loader, SimpleGrid, Stack, Table, Text, Title, Tooltip } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconEdit, IconLinkOff, IconPlus } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api, mensagemErro } from '@/lib/api';
import { mascaraCpf } from '@/lib/cpf';
import { mascaraTelefone } from '@/lib/telefone';
import { STATUS_COLOR, STATUS_LABEL, TIPO_LABEL, type Status, type Tipo } from '@/lib/constants';
import type { Funcionario } from '@/lib/types';
import { AssociarItensModal } from '@/components/AssociarItensModal';
import { FuncionarioModal } from '@/components/FuncionarioModal';

type Ficha = Omit<Funcionario, 'itens'> & {
  createdAt: string;
  equipe: { id: number; nome: string; matricula: string; setor: string | null; ativo: boolean }[];
  itens: { id: number; numeroPatrimonio: string; descricao: string | null; hostname: string | null; ip: string | null; tipo: Tipo; status: Status; osName: string | null; localizacao: string | null; fotoId: number | null }[];
};

export default function FuncionarioPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [editar, setEditar] = useState(false);
  const [associar, setAssociar] = useState(false);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const { data: f, isLoading, error } = useQuery({ queryKey: ['funcionario', id], queryFn: () => api<Ficha>(`/api/funcionarios/${id}`) });

  const desassociar = (alvo: Ficha['itens']) =>
    modals.openConfirmModal({
      title: alvo.length === 1 ? `Desassociar ${alvo[0].numeroPatrimonio}?` : `Desassociar ${alvo.length} itens?`,
      children: <Text size="sm">O(s) item(ns) ficará(ão) sem responsável. A alteração fica registrada no histórico.</Text>,
      labels: { confirm: 'Desassociar', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await api(`/api/funcionarios/${id}/itens`, { method: 'POST', json: { remover: alvo.map((i) => i.id) } });
          setMarcados(new Set());
          qc.invalidateQueries({ queryKey: ['funcionario'] });
          qc.invalidateQueries({ queryKey: ['funcionarios'] });
          qc.invalidateQueries({ queryKey: ['itens'] });
          notifications.show({ color: 'teal', message: `${alvo.length} item(ns) desassociado(s)` });
        } catch (e) {
          notifications.show({ color: 'red', message: mensagemErro(e) });
        }
      },
    });

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
              Gerente
            </Text>
            {f.gerenteId ? (
              <Anchor component={Link} href={`/funcionarios/${f.gerenteId}`} size="sm">
                {f.gerenteNome}
              </Anchor>
            ) : (
              <Text size="sm">—</Text>
            )}
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
            <Text size="sm">{f.celular ? mascaraTelefone(f.celular) : '—'}</Text>
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
      {f.equipe.length > 0 && (
        <Card withBorder>
          <Title order={5} mb="sm">
            Equipe ({f.equipe.length})
          </Title>
          <Group gap="xs">
            {f.equipe.map((m) => (
              <Badge key={m.id} component={Link} href={`/funcionarios/${m.id}`} variant="light" color={m.ativo ? 'blue' : 'gray'} style={{ cursor: 'pointer' }}>
                {m.nome}
              </Badge>
            ))}
          </Group>
        </Card>
      )}
      <Card withBorder>
        <Group justify="space-between" mb="sm">
          <Title order={5}>Itens associados</Title>
          <Group gap="xs">
            {marcados.size > 0 && (
              <Button size="xs" variant="light" color="red" leftSection={<IconLinkOff size={14} />} onClick={() => desassociar(f.itens.filter((i) => marcados.has(i.id)))}>
                Desassociar {marcados.size}
              </Button>
            )}
            <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setAssociar(true)}>
              Associar itens
            </Button>
          </Group>
        </Group>
        {f.itens.length ? (
          <Table striped highlightOnHover fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={36}>
                  <Checkbox
                    size="xs"
                    aria-label="Selecionar todos"
                    checked={marcados.size === f.itens.length}
                    indeterminate={marcados.size > 0 && marcados.size < f.itens.length}
                    onChange={(e) => setMarcados(e.currentTarget.checked ? new Set(f.itens.map((i) => i.id)) : new Set())}
                  />
                </Table.Th>
                <Table.Th w={56} />
                <Table.Th>Patrimônio</Table.Th>
                <Table.Th>Descrição</Table.Th>
                <Table.Th>Tipo</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Hostname</Table.Th>
                <Table.Th>IP</Table.Th>
                <Table.Th>SO</Table.Th>
                <Table.Th>Localização</Table.Th>
                <Table.Th w={40} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {f.itens.map((i) => (
                <Table.Tr key={i.id} bg={marcados.has(i.id) ? 'var(--mantine-primary-color-light)' : undefined}>
                  <Table.Td>
                    <Checkbox
                      size="xs"
                      aria-label={`Selecionar ${i.numeroPatrimonio}`}
                      checked={marcados.has(i.id)}
                      onChange={() =>
                        setMarcados((m) => {
                          const n = new Set(m);
                          if (n.has(i.id)) n.delete(i.id);
                          else n.add(i.id);
                          return n;
                        })
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    {i.fotoId && (
                      <Anchor component={Link} href={`/inventario/${i.id}`} display="block" w={40}>
                        <Image src={`/api/itens/${i.id}/fotos/${i.fotoId}?thumb=1`} alt={`Foto de ${i.numeroPatrimonio}`} loading="lazy" w={40} h={40} radius="sm" fit="cover" />
                      </Anchor>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Anchor component={Link} href={`/inventario/${i.id}`} size="sm" fw={600}>
                      {i.numeroPatrimonio}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>{i.descricao ?? '—'}</Table.Td>
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
                  <Table.Td>
                    <Tooltip label="Desassociar">
                      <ActionIcon variant="subtle" color="red" size="sm" aria-label="Desassociar" onClick={() => desassociar([i])}>
                        <IconLinkOff size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : (
          <Stack align="center" gap="xs" py="lg">
            <Text c="dimmed" size="sm">
              Nenhum item associado.
            </Text>
            <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => setAssociar(true)}>
              Associar o primeiro item
            </Button>
          </Stack>
        )}
      </Card>
      <AssociarItensModal funcionario={associar ? f : null} onClose={() => setAssociar(false)} />
      <FuncionarioModal inicial={editar ? { ...f, itens: f.itens.length } : null} onClose={() => setEditar(false)} />
    </Stack>
  );
}
