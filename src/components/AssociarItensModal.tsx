'use client';

import { Alert, Badge, Button, Center, Checkbox, Group, Loader, Modal, Pill, ScrollArea, SegmentedControl, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconSearch } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, mensagemErro, qs, type Pagina } from '@/lib/api';
import { TIPO_LABEL } from '@/lib/constants';
import type { Item } from '@/lib/types';

type Props = { funcionario: { id: number; nome: string } | null; onClose: () => void };

/** Busca itens do inventário e associa os selecionados ao funcionário (transferindo de outro responsável, se houver). */
export function AssociarItensModal({ funcionario, onClose }: Props) {
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const [q] = useDebouncedValue(busca, 300);
  const [escopo, setEscopo] = useState<'livres' | 'todos'>('livres');
  const [selecionados, setSelecionados] = useState<Map<number, Item>>(new Map());
  const [salvando, setSalvando] = useState(false);

  const params = { q, semResponsavel: escopo === 'livres' ? 'true' : undefined, pageSize: 50, sort: 'numeroPatrimonio' };
  const { data, isFetching } = useQuery({
    queryKey: ['itens', 'associar', params],
    queryFn: () => api<Pagina<Item>>(`/api/itens${qs(params)}`),
    enabled: !!funcionario,
    placeholderData: (p) => p,
  });

  const fechar = () => {
    setBusca('');
    setSelecionados(new Map());
    onClose();
  };

  const alternar = (it: Item) =>
    setSelecionados((m) => {
      const n = new Map(m);
      if (n.has(it.id)) n.delete(it.id);
      else n.set(it.id, it);
      return n;
    });

  const transferidos = [...selecionados.values()].filter((i) => i.funcionarioId && i.funcionarioId !== funcionario?.id);

  const salvar = async () => {
    if (!funcionario) return;
    setSalvando(true);
    try {
      const r = await api<{ alterados: number }>(`/api/funcionarios/${funcionario.id}/itens`, {
        method: 'POST',
        json: { adicionar: [...selecionados.keys()] },
      });
      qc.invalidateQueries({ queryKey: ['funcionario'] });
      qc.invalidateQueries({ queryKey: ['funcionarios'] });
      qc.invalidateQueries({ queryKey: ['itens'] });
      notifications.show({ color: 'teal', message: `${r.alterados} item(ns) associado(s) a ${funcionario.nome}` });
      fechar();
    } catch (e) {
      notifications.show({ color: 'red', message: mensagemErro(e) });
    } finally {
      setSalvando(false);
    }
  };

  const lista = data?.dados ?? [];

  return (
    <Modal opened={!!funcionario} onClose={fechar} title={`Associar itens a ${funcionario?.nome ?? ''}`} size="lg">
      <Stack>
        <Group align="flex-end">
          <TextInput
            data-autofocus
            flex={1}
            leftSection={<IconSearch size={16} />}
            placeholder="Patrimônio, hostname, IP, MAC…"
            value={busca}
            onChange={(e) => setBusca(e.currentTarget.value)}
            rightSection={isFetching ? <Loader size={14} /> : null}
          />
          <SegmentedControl
            value={escopo}
            onChange={(v) => setEscopo(v as 'livres' | 'todos')}
            data={[
              { value: 'livres', label: 'Sem responsável' },
              { value: 'todos', label: 'Todos' },
            ]}
          />
        </Group>

        <ScrollArea h={340} type="auto" offsetScrollbars>
          {!lista.length ? (
            <Center h={300}>
              <Text c="dimmed" size="sm">
                {isFetching ? 'Buscando…' : 'Nenhum item encontrado'}
              </Text>
            </Center>
          ) : (
            <Stack gap={4}>
              {lista.map((it) => {
                const jaDele = it.funcionarioId === funcionario?.id;
                const marcado = jaDele || selecionados.has(it.id);
                return (
                  <UnstyledButton
                    key={it.id}
                    disabled={jaDele}
                    onClick={() => alternar(it)}
                    p="xs"
                    style={{
                      borderRadius: 'var(--mantine-radius-sm)',
                      border: '1px solid var(--mantine-color-default-border)',
                      background: marcado && !jaDele ? 'var(--mantine-primary-color-light)' : undefined,
                      opacity: jaDele ? 0.55 : 1,
                      cursor: jaDele ? 'default' : 'pointer',
                    }}
                  >
                    <Group wrap="nowrap" gap="sm">
                      <Checkbox checked={marcado} disabled={jaDele} readOnly tabIndex={-1} aria-hidden />
                      <Stack gap={0} flex={1} miw={0}>
                        <Group gap={6} wrap="nowrap">
                          <Text size="sm" fw={700} className="mono">
                            {it.numeroPatrimonio}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {TIPO_LABEL[it.tipo]}
                          </Text>
                        </Group>
                        <Text size="xs" c="dimmed" truncate>
                          {[it.hostname, it.ip, it.osName, it.localizacao].filter(Boolean).join(' · ') || '—'}
                        </Text>
                      </Stack>
                      {jaDele ? (
                        <Badge size="sm" variant="light" color="gray">
                          já associado
                        </Badge>
                      ) : it.funcionarioNome ? (
                        <Badge size="sm" variant="light" color="orange" maw={180}>
                          com {it.funcionarioNome}
                        </Badge>
                      ) : null}
                    </Group>
                  </UnstyledButton>
                );
              })}
              {(data?.total ?? 0) > lista.length && (
                <Text size="xs" c="dimmed" ta="center" py="xs">
                  Mostrando {lista.length} de {data?.total}. Refine a busca para encontrar outros.
                </Text>
              )}
            </Stack>
          )}
        </ScrollArea>

        {selecionados.size > 0 && (
          <Group gap={6}>
            {[...selecionados.values()].map((it) => (
              <Pill key={it.id} withRemoveButton onRemove={() => alternar(it)} className="mono">
                {it.numeroPatrimonio}
              </Pill>
            ))}
          </Group>
        )}

        {transferidos.length > 0 && (
          <Alert color="orange" icon={<IconAlertTriangle size={16} />} p="xs">
            <Text size="sm">
              {transferidos.length} item(ns) será(ão) transferido(s) de outro responsável ({[...new Set(transferidos.map((i) => i.funcionarioNome))].join(', ')}).
            </Text>
          </Alert>
        )}

        <Group justify="flex-end">
          <Button variant="default" onClick={fechar}>
            Cancelar
          </Button>
          <Button onClick={salvar} loading={salvando} disabled={!selecionados.size}>
            {selecionados.size ? `Associar ${selecionados.size} item(ns)` : 'Associar'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
