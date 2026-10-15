'use client';

import { Autocomplete, Button, Group, Modal, SegmentedControl, Stack, Text, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, mensagemErro } from '@/lib/api';
import type { Host } from '@/lib/types';

const TIPOS_REDE = ['Impressora', 'Access point', 'Câmera IP', 'Switch', 'Roteador', 'Firewall', 'Telefone IP', 'NAS', 'Nobreak', 'IoT', 'Outro'];

/** Classificação IPDiscover: dispositivo de rede conhecido ou ignorar (persistido por MAC). */
export function ClassificarModal({
  hosts,
  inicial = 'conhecido',
  onClose,
}: {
  hosts: Host[];
  inicial?: 'conhecido' | 'ignorado';
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [classificacao, setClassificacao] = useState(inicial);
  const [tipo, setTipo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    setSalvando(true);
    try {
      await api('/api/msf/classificar', {
        method: 'POST',
        json: { dispositivos: hosts.map((h) => ({ mac: h.mac, ip: h.address, classificacao, tipo, descricao })) },
      });
      notifications.show({ color: 'teal', message: `${hosts.length} host(s) classificado(s)` });
      qc.invalidateQueries({ queryKey: ['hosts'] });
      qc.invalidateQueries({ queryKey: ['subredes'] });
      qc.invalidateQueries({ queryKey: ['dispositivos'] });
      onClose();
    } catch (e) {
      notifications.show({ color: 'red', message: mensagemErro(e) });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal opened={hosts.length > 0} onClose={onClose} title="Classificar dispositivo" size="md">
      <Stack>
        <Text size="sm" c="dimmed">
          {hosts.length === 1 ? `${hosts[0].address} ${hosts[0].mac ?? '(sem MAC — será lembrado pelo IP)'}` : `${hosts.length} hosts selecionados`}
        </Text>
        <SegmentedControl
          value={classificacao}
          onChange={(v) => setClassificacao(v as 'conhecido' | 'ignorado')}
          data={[
            { value: 'conhecido', label: 'Dispositivo de rede conhecido' },
            { value: 'ignorado', label: 'Ignorar' },
          ]}
        />
        {classificacao === 'conhecido' && <Autocomplete label="Tipo" data={TIPOS_REDE} value={tipo} onChange={setTipo} />}
        <Textarea label="Descrição" autosize minRows={2} value={descricao} onChange={(e) => setDescricao(e.currentTarget.value)} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={salvar} loading={salvando}>
            Salvar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
