'use client';

import { ActionIcon, Alert, Badge, Button, Card, Group, Modal, NumberInput, Select, Stack, Switch, Table, TagsInput, Text, TextInput, Title } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconEdit, IconLock, IconPlus, IconTrash } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSessao } from '@/components/Shell';
import { api, mensagemErro } from '@/lib/api';
import type { CampoCustom } from '@/lib/types';

const TIPO_CAMPO = { texto: 'Texto', numero: 'Número', data: 'Data', lista: 'Lista' };

/** Corpo aceito por PUT/POST /api/campos (sem id nem contadores). */
const corpoCampo = (c: CampoCustom) => ({
  chave: c.chave,
  nome: c.nome,
  tipo: c.tipo,
  opcoes: c.opcoes ?? [],
  obrigatorio: c.obrigatorio,
  ativo: c.ativo,
  ordem: c.ordem,
});

function CampoModal({ inicial, proximaOrdem, onClose }: { inicial: CampoCustom | 'novo'; proximaOrdem: number; onClose: () => void }) {
  const qc = useQueryClient();
  const c = inicial === 'novo' ? null : inicial;
  const [v, setV] = useState({
    chave: c?.chave ?? '',
    nome: c?.nome ?? '',
    tipo: c?.tipo ?? 'texto',
    opcoes: c?.opcoes ?? [],
    obrigatorio: c?.obrigatorio ?? false,
    ativo: c?.ativo ?? true,
    ordem: c?.ordem ?? proximaOrdem,
  });
  const [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    setSalvando(true);
    try {
      await api(c ? `/api/campos/${c.id}` : '/api/campos', { method: c ? 'PUT' : 'POST', json: v });
      qc.invalidateQueries({ queryKey: ['campos'] });
      notifications.show({ color: 'teal', message: 'Campo salvo' });
      onClose();
    } catch (e) {
      notifications.show({ color: 'red', message: mensagemErro(e) });
    } finally {
      setSalvando(false);
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
        <TextInput
          label="Chave interna"
          description={c ? 'usada no CSV; alterar quebra planilhas que já usam a chave antiga' : 'minúsculas, números e _ (usada no CSV)'}
          value={v.chave}
          onChange={(e) => setV({ ...v, chave: e.currentTarget.value })}
        />
        <Select
          label="Tipo"
          allowDeselect={false}
          data={Object.entries(TIPO_CAMPO).map(([value, label]) => ({ value, label }))}
          value={v.tipo}
          onChange={(t) => setV({ ...v, tipo: t as CampoCustom['tipo'] })}
        />
        {v.tipo === 'lista' && (
          <TagsInput label="Opções" description="digite e tecle Enter para adicionar" withAsterisk value={v.opcoes} onChange={(o) => setV({ ...v, opcoes: o })} />
        )}
        <NumberInput label="Ordem" description="posição no formulário do item" value={v.ordem} onChange={(o) => setV({ ...v, ordem: Number(o) || 0 })} />
        <Switch label="Obrigatório" checked={v.obrigatorio} onChange={(e) => setV({ ...v, obrigatorio: e.currentTarget.checked })} />
        <Switch label="Ativo" checked={v.ativo} onChange={(e) => setV({ ...v, ativo: e.currentTarget.checked })} />
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

export default function CamposPage() {
  const qc = useQueryClient();
  const { data: sessao } = useSessao();
  const admin = sessao?.papel === 'admin';
  const { data: campos = [], isLoading } = useQuery({ queryKey: ['campos', 'todos'], queryFn: () => api<CampoCustom[]>('/api/campos') });
  const [editar, setEditar] = useState<CampoCustom | 'novo' | null>(null);

  const alternarAtivo = async (c: CampoCustom) => {
    try {
      await api(`/api/campos/${c.id}`, { method: 'PUT', json: { ...corpoCampo(c), ativo: !c.ativo } });
      qc.invalidateQueries({ queryKey: ['campos'] });
    } catch (e) {
      notifications.show({ color: 'red', message: mensagemErro(e) });
    }
  };

  const excluir = (c: CampoCustom) =>
    modals.openConfirmModal({
      title: `Excluir campo ${c.nome}?`,
      children: (
        <Text size="sm">
          {c.emUso
            ? `${c.emUso} ${c.emUso === 1 ? 'item tem' : 'itens têm'} valor preenchido neste campo, e esses valores serão apagados.`
            : 'Nenhum item tem valor preenchido neste campo.'}{' '}
          Para preservar os valores, apenas inative o campo.
        </Text>
      ),
      labels: { confirm: 'Excluir', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await api(`/api/campos/${c.id}`, { method: 'DELETE' });
          qc.invalidateQueries({ queryKey: ['campos'] });
          notifications.show({ color: 'teal', message: 'Campo excluído' });
        } catch (e) {
          notifications.show({ color: 'red', message: mensagemErro(e) });
        }
      },
    });

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={3}>Campos customizados</Title>
          <Text size="sm" c="dimmed">
            Dados administrativos extras exibidos no formulário de item e incluídos no CSV. Campos inativos somem do formulário, mas os valores são mantidos.
          </Text>
        </div>
        <Button leftSection={<IconPlus size={16} />} disabled={!admin} onClick={() => setEditar('novo')}>
          Novo campo
        </Button>
      </Group>

      {!admin && (
        <Alert icon={<IconLock size={16} />} color="gray">
          Somente administradores podem criar ou alterar campos.
        </Alert>
      )}

      <Card withBorder p={0}>
        <Table.ScrollContainer minWidth={760}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Ordem</Table.Th>
                <Table.Th>Nome</Table.Th>
                <Table.Th>Chave</Table.Th>
                <Table.Th>Tipo</Table.Th>
                <Table.Th>Opções</Table.Th>
                <Table.Th>Obrigatório</Table.Th>
                <Table.Th>Em uso</Table.Th>
                <Table.Th>Ativo</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {campos.map((c) => (
                <Table.Tr key={c.id} opacity={c.ativo ? 1 : 0.6}>
                  <Table.Td>{c.ordem}</Table.Td>
                  <Table.Td fw={600}>{c.nome}</Table.Td>
                  <Table.Td className="mono">{c.chave}</Table.Td>
                  <Table.Td>{TIPO_CAMPO[c.tipo]}</Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      {c.opcoes?.map((o) => (
                        <Badge key={o} size="sm" variant="outline" tt="none">
                          {o}
                        </Badge>
                      ))}
                    </Group>
                  </Table.Td>
                  <Table.Td>{c.obrigatorio ? 'sim' : 'não'}</Table.Td>
                  <Table.Td>{c.emUso ?? 0} itens</Table.Td>
                  <Table.Td>
                    {admin ? (
                      <Switch size="xs" checked={c.ativo} onChange={() => alternarAtivo(c)} aria-label={c.ativo ? 'Inativar' : 'Ativar'} />
                    ) : (
                      <Badge size="sm" variant="light" color={c.ativo ? 'teal' : 'gray'}>
                        {c.ativo ? 'ativo' : 'inativo'}
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {admin && (
                      <Group gap={2} wrap="nowrap">
                        <ActionIcon variant="subtle" size="sm" onClick={() => setEditar(c)} aria-label="Editar">
                          <IconEdit size={16} />
                        </ActionIcon>
                        <ActionIcon variant="subtle" size="sm" color="red" aria-label="Excluir" onClick={() => excluir(c)}>
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
              {!isLoading && campos.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={9}>
                    <Text size="sm" c="dimmed" ta="center" py="md">
                      Nenhum campo customizado cadastrado.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>

      {editar && (
        <CampoModal inicial={editar} proximaOrdem={Math.max(0, ...campos.map((c) => c.ordem)) + 1} onClose={() => setEditar(null)} />
      )}
    </Stack>
  );
}
