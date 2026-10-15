'use client';

import { Alert, Badge, Button, Checkbox, Group, Loader, Modal, Stack, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconInfoCircle } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, mensagemErro } from '@/lib/api';
import { CAMPO_LABEL } from '@/lib/constants';
import { fmtDataHora } from '@/lib/format';

type Preview =
  | { encontrado: false; diffs: [] }
  | {
      encontrado: true;
      criterio: 'msf_host_id' | 'mac' | 'ip';
      host: { id: number; address: string; mac: string | null; name: string | null; workspace: string | null; updatedAt: string | null };
      diffs: { campo: string; atual: string | null; msf: string | null }[];
    };

const CRITERIO = { msf_host_id: 'id do host de origem', mac: 'MAC', ip: 'IP' };

/** “Sincronizar com msf”: mostra o diff e aplica só os campos marcados (nunca campos manuais). */
export function SyncModal({ itemId, onClose }: { itemId: number | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['sync', itemId],
    queryFn: () => api<Preview>(`/api/itens/${itemId}/sync`),
    enabled: !!itemId,
    gcTime: 0,
  });
  const [marcados, setMarcados] = useState<string[]>([]);
  const [aplicando, setAplicando] = useState(false);
  useEffect(() => setMarcados(data?.diffs.map((d) => d.campo) ?? []), [data]);

  const aplicar = async () => {
    setAplicando(true);
    try {
      await api(`/api/itens/${itemId}/sync`, { method: 'POST', json: { campos: marcados } });
      notifications.show({ color: 'teal', message: 'Item sincronizado com o msf' });
      ['item', 'itens', 'historico', 'secoes'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      onClose();
    } catch (e) {
      notifications.show({ color: 'red', message: mensagemErro(e) });
    } finally {
      setAplicando(false);
    }
  };

  return (
    <Modal opened={!!itemId} onClose={onClose} title="Sincronizar com msf" size="lg">
      {isLoading ? (
        <Loader size="sm" />
      ) : error ? (
        <Alert color="red">{mensagemErro(error)}</Alert>
      ) : !data?.encontrado ? (
        <Alert color="yellow" icon={<IconInfoCircle size={18} />}>
          O host de origem não foi encontrado no msf (nem pelo id, nem por MAC/IP). Pode ter sido removido ou o banco foi reiniciado (msfdb
          reinit) sem novo scan.
        </Alert>
      ) : (
        <Stack>
          <Text size="sm">
            Host <b className="mono">{data.host.address}</b> {data.host.mac && <span className="mono">({data.host.mac})</span>} · workspace{' '}
            {data.host.workspace} · encontrado por <Badge size="xs">{CRITERIO[data.criterio]}</Badge> · visto em {fmtDataHora(data.host.updatedAt)}
          </Text>
          {data.diffs.length === 0 ? (
            <Alert color="teal">Nada a atualizar: o item já está igual ao msf. O “último visto” será atualizado.</Alert>
          ) : (
            <Table withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={40} />
                  <Table.Th>Campo</Table.Th>
                  <Table.Th>Inventário (atual)</Table.Th>
                  <Table.Th>msf (novo)</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.diffs.map((d) => (
                  <Table.Tr key={d.campo}>
                    <Table.Td>
                      <Checkbox
                        aria-label={`Aplicar ${d.campo}`}
                        checked={marcados.includes(d.campo)}
                        onChange={(e) =>
                          setMarcados((m) => (e.currentTarget.checked ? [...m, d.campo] : m.filter((x) => x !== d.campo)))
                        }
                      />
                    </Table.Td>
                    <Table.Td>{CAMPO_LABEL[d.campo] ?? d.campo}</Table.Td>
                    <Table.Td>
                      <Text size="sm" td="line-through" c="red">
                        {d.atual ?? '(vazio)'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="teal" fw={600}>
                        {d.msf}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
          <Text size="xs" c="dimmed">
            Somente IP, MAC, hostname, SO e arquitetura podem ser sincronizados. Patrimônio, responsável, setor, localização e demais campos
            manuais nunca são alterados. Campos vazios no msf não apagam dados do inventário.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={aplicar} loading={aplicando} disabled={data.diffs.length > 0 && !marcados.length}>
              {data.diffs.length ? `Aplicar ${marcados.length} campo(s)` : 'Atualizar último visto'}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
