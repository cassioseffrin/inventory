'use client';

import { Badge, Box, Center, Code, Grid, Loader, ScrollArea, Spoiler, Stack, Table, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fmtDataHora } from '@/lib/format';
import type { Host } from '@/lib/types';

type Detalhe = {
  host: Host;
  servicos: { id: number; port: number; proto: string; state: string | null; name: string | null; info: string | null }[];
  detalhes: Record<string, unknown>[];
  notas: { id: number; ntype: string | null; data: string | null; critical: boolean | null; created_at: string | null }[];
};

/** Conteúdo da linha expandida: serviços/portas, host_details e notas do msf (somente leitura). */
export function HostDetalhe({ hostId }: { hostId: number }) {
  const { data, isLoading, error } = useQuery({ queryKey: ['host', hostId], queryFn: () => api<Detalhe>(`/api/msf/hosts/${hostId}`) });
  if (isLoading)
    return (
      <Center p="md">
        <Loader size="sm" />
      </Center>
    );
  if (error || !data) return <Text c="red" p="md">Erro ao carregar o host</Text>;
  const h = data.host;

  return (
    <Box p="md" bg="var(--mantine-color-default-hover)">
      <Grid>
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Title order={6} mb="xs">
            Serviços / portas ({data.servicos.length})
          </Title>
          {data.servicos.length ? (
            <ScrollArea.Autosize mah={280}>
              <Table fz="xs" verticalSpacing={2} withTableBorder>
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
                      <Table.Td>
                        <Badge size="xs" variant="light" color={s.state === 'open' ? 'teal' : 'gray'}>
                          {s.state}
                        </Badge>
                      </Table.Td>
                      <Table.Td>{s.name}</Table.Td>
                      <Table.Td>{s.info}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>
          ) : (
            <Text size="sm" c="dimmed">
              Nenhum serviço registrado.
            </Text>
          )}
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Stack gap="sm">
            <div>
              <Title order={6} mb={4}>
                Host
              </Title>
              <Text size="xs">
                <b>SO:</b> {[h.os_name, h.os_flavor, h.os_sp].filter(Boolean).join(' ') || '—'} {h.os_family ? `(${h.os_family})` : ''}
                <br />
                <b>Propósito:</b> {h.purpose ?? '—'} · <b>Arquitetura:</b> {h.arch ?? '—'}
                <br />
                <b>Info:</b> {h.info ?? '—'}
                <br />
                <b>Comentários:</b> {h.comments ?? '—'}
                <br />
                <b>Criado:</b> {fmtDataHora(h.created_at)} · <b>Atualizado:</b> {fmtDataHora(h.updated_at)}
              </Text>
            </div>
            <div>
              <Title order={6} mb={4}>
                host_details
              </Title>
              {data.detalhes.length ? (
                data.detalhes.map((d, i) => (
                  <Code key={i} block fz="xs">
                    {JSON.stringify(Object.fromEntries(Object.entries(d).filter(([, v]) => v !== null)), null, 1)}
                  </Code>
                ))
              ) : (
                <Text size="xs" c="dimmed">
                  Sem dados (tabela usada apenas por importações do Nexpose).
                </Text>
              )}
            </div>
            <div>
              <Title order={6} mb={4}>
                Notas ({h.notas})
              </Title>
              {data.notas.length ? (
                <Spoiler maxHeight={120} showLabel="ver mais" hideLabel="ver menos">
                  <Stack gap={4}>
                    {data.notas.map((n) => (
                      <Text key={n.id} size="xs">
                        <Badge size="xs" variant="outline" color={n.critical ? 'red' : 'gray'} mr={4}>
                          {n.ntype}
                        </Badge>
                        <span className="mono">{(n.data ?? '').slice(0, 200)}</span>
                      </Text>
                    ))}
                  </Stack>
                </Spoiler>
              ) : (
                <Text size="xs" c="dimmed">
                  —
                </Text>
              )}
            </div>
          </Stack>
        </Grid.Col>
      </Grid>
    </Box>
  );
}
