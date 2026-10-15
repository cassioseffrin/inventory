'use client';

import { Badge, Group, Modal, Text } from '@mantine/core';
import { useState } from 'react';
import type { Host } from '@/lib/types';
import { ItemForm, VAZIO, type ItemFormValues } from '../ItemForm';

/** Campos que são mantidos de um host para o próximo no assistente de clonagem em lote. */
const COMUNS = ['tipo', 'status', 'funcionarioId', 'setor', 'localizacao', 'tag', 'fornecedor', 'notaFiscal', 'dataAquisicao', 'camposCustomizados'] as const;

/** Sugere o tipo a partir do `purpose` que o nmap/msf atribui ao host. */
function tipoSugerido(h: Host): ItemFormValues['tipo'] | undefined {
  const p = `${h.purpose ?? ''} ${h.os_name ?? ''}`.toLowerCase();
  if (/printer/.test(p)) return 'impressora';
  if (/router|switch|firewall/.test(p)) return 'switch';
  if (/server/.test(p)) return 'servidor';
  if (/client/.test(p)) return 'desktop';
  return undefined;
}

function hostParaForm(h: Host, comuns: Partial<ItemFormValues>): ItemFormValues {
  const tipo = tipoSugerido(h);
  return {
    ...VAZIO,
    ...comuns,
    ...(tipo ? { tipo } : {}),
    numeroPatrimonio: '',
    ip: h.address,
    mac: h.mac ?? '',
    hostname: h.name ?? '',
    osName: h.os_name ?? '',
    osFlavor: h.os_flavor ?? '',
    osSp: h.os_sp ?? '',
    osFamily: h.os_family ?? '',
    arch: h.arch ?? '',
  };
}

/**
 * Clonagem msf → inventário. Com um host abre o formulário pré-preenchido;
 * com vários percorre um a um (patrimônio é único por item), reaproveitando os campos comuns.
 */
export function ClonarModal({ hosts, onClose }: { hosts: Host[]; onClose: () => void }) {
  const [idx, setIdx] = useState(0);
  const [comuns, setComuns] = useState<Partial<ItemFormValues>>({});
  const [salvos, setSalvos] = useState(0);
  const h = hosts[idx];

  const proximo = () => (idx + 1 < hosts.length ? setIdx(idx + 1) : onClose());

  return (
    <Modal
      opened={!!h}
      onClose={onClose}
      size="xl"
      title={
        <Group gap="xs">
          <Text fw={600}>Adicionar ao inventário</Text>
          {h && (
            <Badge variant="light" className="mono">
              {h.address} {h.mac ? `· ${h.mac}` : ''}
            </Badge>
          )}
        </Group>
      }
    >
      {h && (
        <ItemForm
          key={h.id}
          inicial={hostParaForm(h, comuns)}
          origemMsf={{ hostId: h.id, workspaceId: h.workspace_id }}
          onSalvo={(_, v) => {
            setComuns(Object.fromEntries(COMUNS.map((k) => [k, v[k]])) as Partial<ItemFormValues>);
            setSalvos((s) => s + 1);
            proximo();
          }}
          onCancelar={hosts.length > 1 ? proximo : onClose}
          rodape={
            hosts.length > 1 ? (
              <Text size="sm" c="dimmed">
                Host {idx + 1} de {hosts.length} · {salvos} adicionado(s) · “Cancelar” pula este host
              </Text>
            ) : null
          }
        />
      )}
    </Modal>
  );
}
