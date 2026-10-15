'use client';

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Code,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Switch,
  Table,
  TagsInput,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconEdit, IconLock, IconPlus, IconTrash } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSessao } from '@/components/Shell';
import { api, mensagemErro } from '@/lib/api';
import type { CampoCustom } from '@/lib/types';

const TIPO_CAMPO = { texto: 'Texto', numero: 'Número', data: 'Data', lista: 'Lista' };

function CampoModal({ inicial, onClose }: { inicial: CampoCustom | 'novo'; onClose: () => void }) {
  const qc = useQueryClient();
  const c = inicial === 'novo' ? null : inicial;
  const [v, setV] = useState({
    chave: c?.chave ?? '',
    nome: c?.nome ?? '',
    tipo: c?.tipo ?? 'texto',
    opcoes: c?.opcoes ?? [],
    obrigatorio: c?.obrigatorio ?? false,
    ativo: c?.ativo ?? true,
    ordem: c?.ordem ?? 0,
  });
  const salvar = async () => {
    try {
      await api(c ? `/api/campos/${c.id}` : '/api/campos', { method: c ? 'PUT' : 'POST', json: v });
      qc.invalidateQueries({ queryKey: ['campos'] });
      notifications.show({ color: 'teal', message: 'Campo salvo' });
      onClose();
    } catch (e) {
      notifications.show({ color: 'red', message: mensagemErro(e) });
    }
  };
  return (
    <Modal opened onClose={onClose} title={c ? `Editar campo ${c.nome}` : 'Novo campo customizado'}>
      <Stack>
        <TextInput
          label="Nome exibido"
          withAsterisk
          value={v.nome}
          onChange={(e) => {
            const nome = e.currentTarget.value;
            setV((x) => ({
              ...x,
              nome,
              // sugere a chave a partir do nome enquanto for um campo novo
              chave: c
                ? x.chave
                : nome
                    .normalize('NFD')
                    .replace(/[̀-ͯ]/g, '')
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '_')
                    .replace(/^_+|_+$/g, '')
                    .replace(/^(\d)/, 'c_$1'),
            }));
          }}
        />
        <TextInput label="Chave interna" description="minúsculas, números e _" value={v.chave} onChange={(e) => setV({ ...v, chave: e.currentTarget.value })} />
        <Select
          label="Tipo"
          allowDeselect={false}
          data={Object.entries(TIPO_CAMPO).map(([value, label]) => ({ value, label }))}
          value={v.tipo}
          onChange={(t) => setV({ ...v, tipo: t as CampoCustom['tipo'] })}
        />
        {v.tipo === 'lista' && <TagsInput label="Opções" value={v.opcoes} onChange={(o) => setV({ ...v, opcoes: o })} />}
        <NumberInput label="Ordem" value={v.ordem} onChange={(o) => setV({ ...v, ordem: Number(o) || 0 })} />
        <Switch label="Obrigatório" checked={v.obrigatorio} onChange={(e) => setV({ ...v, obrigatorio: e.currentTarget.checked })} />
        <Switch label="Ativo" checked={v.ativo} onChange={(e) => setV({ ...v, ativo: e.currentTarget.checked })} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={salvar}>Salvar</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default function ConfiguracoesPage() {
  const qc = useQueryClient();
  const { data: sessao } = useSessao();
  const admin = sessao?.papel === 'admin';
  const { data: campos = [] } = useQuery({ queryKey: ['campos', 'todos'], queryFn: () => api<CampoCustom[]>('/api/campos') });
  const [editar, setEditar] = useState<CampoCustom | 'novo' | null>(null);
  const [origem, setOrigem] = useState('http://<servidor>:3000');
  useEffect(() => setOrigem(window.location.origin), []);

  return (
    <Stack>
      <Title order={3}>Configurações</Title>

      <Card withBorder>
        <Group justify="space-between" mb="xs">
          <div>
            <Title order={5}>Dados administrativos (campos customizados)</Title>
            <Text size="sm" c="dimmed">
              Campos extras exibidos no formulário de item e incluídos no CSV. A TAG principal é um campo fixo do item.
            </Text>
          </div>
          <Button leftSection={<IconPlus size={16} />} disabled={!admin} onClick={() => setEditar('novo')}>
            Novo campo
          </Button>
        </Group>
        {!admin && (
          <Alert icon={<IconLock size={16} />} color="gray" mb="sm">
            Somente administradores podem criar ou alterar campos.
          </Alert>
        )}
        <Table striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Ordem</Table.Th>
              <Table.Th>Nome</Table.Th>
              <Table.Th>Chave</Table.Th>
              <Table.Th>Tipo</Table.Th>
              <Table.Th>Opções</Table.Th>
              <Table.Th>Obrigatório</Table.Th>
              <Table.Th>Ativo</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {campos.map((c) => (
              <Table.Tr key={c.id}>
                <Table.Td>{c.ordem}</Table.Td>
                <Table.Td fw={600}>{c.nome}</Table.Td>
                <Table.Td className="mono">{c.chave}</Table.Td>
                <Table.Td>{TIPO_CAMPO[c.tipo]}</Table.Td>
                <Table.Td>{c.opcoes?.join(', ')}</Table.Td>
                <Table.Td>{c.obrigatorio ? 'sim' : 'não'}</Table.Td>
                <Table.Td>
                  <Badge size="sm" variant="light" color={c.ativo ? 'teal' : 'gray'}>
                    {c.ativo ? 'ativo' : 'inativo'}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  {admin && (
                    <Group gap={2} wrap="nowrap">
                      <ActionIcon variant="subtle" size="sm" onClick={() => setEditar(c)} aria-label="Editar">
                        <IconEdit size={16} />
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        size="sm"
                        color="red"
                        aria-label="Excluir"
                        onClick={() =>
                          modals.openConfirmModal({
                            title: `Excluir campo ${c.nome}?`,
                            children: <Text size="sm">Os valores preenchidos em todos os itens serão apagados. Para preservá-los, apenas inative o campo.</Text>,
                            labels: { confirm: 'Excluir', cancel: 'Cancelar' },
                            confirmProps: { color: 'red' },
                            onConfirm: async () => {
                              await api(`/api/campos/${c.id}`, { method: 'DELETE' });
                              qc.invalidateQueries({ queryKey: ['campos'] });
                            },
                          })
                        }
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>

      <Card withBorder>
        <Title order={5} mb="xs">
          Exportar do Kali para o inventário
        </Title>
        <Text size="sm" mb="xs">
          Depois de escanear as faixas com <Code>db_nmap</Code>, o Kali pode chamar a importação em massa com o token <Code>IMPORT_API_TOKEN</Code>{' '}
          (definido no <Code>.env</Code> do servidor). O script <Code>scripts/kali/scan-e-exporta.sh</Code> faz o scan e a exportação de uma vez:
        </Text>
        <Code block>
          {`INV_URL=${origem} INV_TOKEN=<token> \\
  ./scan-e-exporta.sh -w filial-sp 10.10.0.0/24 10.10.1.0/24 192.168.50.0/24

# só exportar o que já está no msf (sem escanear):
curl -X POST ${origem}/api/msf/importar \\
  -H "Authorization: Bearer $INV_TOKEN" -H 'content-type: application/json' \\
  -d '{"workspaceNome":"filial-sp","subredes":["10.10.0.0/24"],"simular":true}'`}
        </Code>
      </Card>

      {editar && <CampoModal inicial={editar} onClose={() => setEditar(null)} />}
    </Stack>
  );
}
