'use client';

import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  Select,
  Stack,
  Table,
  Tabs,
  TagsInput,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconEdit, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { api, mensagemErro, qs } from '@/lib/api';
import { CATEGORIAS_SOFTWARE, CATEGORIA_LABEL } from '@/lib/constants';

type Entrada = { id: number; nomeCanonico: string; categoria: string; editor: string | null; observacao: string | null; variacoes: string[]; instalacoes: number };
type Instalacao = { itemId: number; numeroPatrimonio: string; hostname: string | null; ip: string | null; setor?: string | null; funcionarioNome: string | null; software: string; versao: string | null; editor?: string | null; nomeCanonico?: string };

const CAT_OPCOES = CATEGORIAS_SOFTWARE.map((c) => ({ value: c, label: CATEGORIA_LABEL[c] }));
const corCategoria = (c: string) => (c === 'proibido' ? 'red' : c === 'seguranca' ? 'green' : 'blue');

function useInvalidar() {
  const qc = useQueryClient();
  return () => ['dicionario', 'nao-classificados', 'proibidos', 'softwares', 'dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

function EntradaModal({ inicial, nomesIniciais, onClose }: { inicial: Entrada | 'nova'; nomesIniciais?: string[]; onClose: () => void }) {
  const invalidar = useInvalidar();
  const e = inicial === 'nova' ? null : inicial;
  const [v, setV] = useState({
    nomeCanonico: e?.nomeCanonico ?? nomesIniciais?.[0] ?? '',
    categoria: e?.categoria ?? 'outro',
    editor: e?.editor ?? '',
    observacao: e?.observacao ?? '',
    variacoes: e?.variacoes ?? nomesIniciais ?? [],
  });
  const salvar = async () => {
    try {
      await api(e ? `/api/dicionario/${e.id}` : '/api/dicionario', { method: e ? 'PUT' : 'POST', json: v });
      notifications.show({ color: 'teal', message: 'Dicionário atualizado e softwares reclassificados' });
      invalidar();
      onClose();
    } catch (err) {
      notifications.show({ color: 'red', message: mensagemErro(err) });
    }
  };
  return (
    <Modal opened onClose={onClose} title={e ? `Editar ${e.nomeCanonico}` : 'Nova entrada no dicionário'} size="lg">
      <Stack>
        <TextInput label="Nome canônico" withAsterisk value={v.nomeCanonico} onChange={(x) => setV({ ...v, nomeCanonico: x.currentTarget.value })} />
        <Select label="Categoria" allowDeselect={false} data={CAT_OPCOES} value={v.categoria} onChange={(x) => setV({ ...v, categoria: x! })} />
        <TextInput label="Editor" value={v.editor} onChange={(x) => setV({ ...v, editor: x.currentTarget.value })} />
        <TagsInput
          label="Variações de nome"
          description="Nomes como aparecem nas máquinas. Use * como curinga (ex.: “google chrome*”). Sem diferenciar maiúsculas."
          value={v.variacoes}
          onChange={(x) => setV({ ...v, variacoes: x })}
          clearable
        />
        <Textarea label="Observação" autosize value={v.observacao} onChange={(x) => setV({ ...v, observacao: x.currentTarget.value })} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={!v.nomeCanonico.trim()}>
            Salvar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function Dicionario() {
  const invalidar = useInvalidar();
  const { data = [] } = useQuery({ queryKey: ['dicionario'], queryFn: () => api<Entrada[]>('/api/dicionario') });
  const [editar, setEditar] = useState<Entrada | 'nova' | null>(null);
  const [filtro, setFiltro] = useState('');
  const visiveis = data.filter((e) => `${e.nomeCanonico} ${e.variacoes.join(' ')} ${e.categoria}`.toLowerCase().includes(filtro.toLowerCase()));
  return (
    <Stack>
      <Group justify="space-between">
        <TextInput leftSection={<IconSearch size={16} />} placeholder="Filtrar" value={filtro} onChange={(e) => setFiltro(e.currentTarget.value)} w={280} />
        <Button leftSection={<IconPlus size={16} />} onClick={() => setEditar('nova')}>
          Nova entrada
        </Button>
      </Group>
      <Table striped>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Nome canônico</Table.Th>
            <Table.Th>Categoria</Table.Th>
            <Table.Th>Editor</Table.Th>
            <Table.Th>Variações</Table.Th>
            <Table.Th>Máquinas</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {visiveis.map((e) => (
            <Table.Tr key={e.id}>
              <Table.Td fw={600}>{e.nomeCanonico}</Table.Td>
              <Table.Td>
                <Badge variant="light" color={corCategoria(e.categoria)}>
                  {CATEGORIA_LABEL[e.categoria as keyof typeof CATEGORIA_LABEL]}
                </Badge>
              </Table.Td>
              <Table.Td>{e.editor}</Table.Td>
              <Table.Td>
                <Group gap={4}>
                  {e.variacoes.map((v) => (
                    <Badge key={v} size="xs" variant="outline" tt="none">
                      {v}
                    </Badge>
                  ))}
                </Group>
              </Table.Td>
              <Table.Td>{e.instalacoes}</Table.Td>
              <Table.Td>
                <Group gap={2} wrap="nowrap">
                  <ActionIcon variant="subtle" size="sm" onClick={() => setEditar(e)} aria-label="Editar">
                    <IconEdit size={16} />
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    color="red"
                    aria-label="Excluir"
                    onClick={() =>
                      modals.openConfirmModal({
                        title: `Excluir ${e.nomeCanonico}?`,
                        children: <Text size="sm">Os softwares instalados voltam a ficar sem classificação.</Text>,
                        labels: { confirm: 'Excluir', cancel: 'Cancelar' },
                        confirmProps: { color: 'red' },
                        onConfirm: async () => {
                          await api(`/api/dicionario/${e.id}`, { method: 'DELETE' });
                          invalidar();
                        },
                      })
                    }
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {editar && <EntradaModal inicial={editar} onClose={() => setEditar(null)} />}
    </Stack>
  );
}

function NaoClassificados() {
  const invalidar = useInvalidar();
  const [busca, setBusca] = useState('');
  const [q] = useDebouncedValue(busca, 300);
  const { data = [] } = useQuery({
    queryKey: ['nao-classificados', q],
    queryFn: () => api<{ nome: string; itens: number; editor: string | null }[]>(`/api/dicionario/nao-classificados${qs({ q })}`),
  });
  const { data: entradas = [] } = useQuery({ queryKey: ['dicionario'], queryFn: () => api<Entrada[]>('/api/dicionario') });
  const [sel, setSel] = useState<string[]>([]);
  const [destino, setDestino] = useState<string | null>(null);
  const [nova, setNova] = useState(false);

  const agrupar = async () => {
    try {
      await api(`/api/dicionario/${destino}/agrupar`, { method: 'POST', json: { nomes: sel } });
      notifications.show({ color: 'teal', message: `${sel.length} nome(s) agrupado(s)` });
      setSel([]);
      invalidar();
    } catch (e) {
      notifications.show({ color: 'red', message: mensagemErro(e) });
    }
  };

  return (
    <Stack>
      <Text size="sm" c="dimmed">
        Nomes de software instalados que ainda não casam com nenhuma entrada. Selecione as variações e agrupe sob um nome canônico.
      </Text>
      <Group>
        <TextInput leftSection={<IconSearch size={16} />} placeholder="Buscar nome" value={busca} onChange={(e) => setBusca(e.currentTarget.value)} w={260} />
        <Select
          placeholder="Agrupar em…"
          searchable
          data={entradas.map((e) => ({ value: String(e.id), label: e.nomeCanonico }))}
          value={destino}
          onChange={setDestino}
          w={260}
        />
        <Button disabled={!sel.length || !destino} onClick={agrupar}>
          Agrupar {sel.length || ''}
        </Button>
        <Button variant="light" disabled={!sel.length} onClick={() => setNova(true)}>
          Novo nome canônico com a seleção
        </Button>
      </Group>
      <Table striped>
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={40} />
            <Table.Th>Nome encontrado</Table.Th>
            <Table.Th>Editor</Table.Th>
            <Table.Th>Máquinas</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {!data.length && (
            <Table.Tr>
              <Table.Td colSpan={4}>
                <Text c="dimmed" ta="center" size="sm" p="md">
                  Tudo classificado.
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
          {data.map((s) => (
            <Table.Tr key={s.nome}>
              <Table.Td>
                <Checkbox
                  aria-label={s.nome}
                  checked={sel.includes(s.nome)}
                  onChange={(e) => setSel((x) => (e.currentTarget.checked ? [...x, s.nome] : x.filter((n) => n !== s.nome)))}
                />
              </Table.Td>
              <Table.Td>{s.nome}</Table.Td>
              <Table.Td>{s.editor}</Table.Td>
              <Table.Td>{s.itens}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {nova && (
        <EntradaModal
          inicial="nova"
          nomesIniciais={sel}
          onClose={() => {
            setNova(false);
            setSel([]);
          }}
        />
      )}
    </Stack>
  );
}

function TabelaInstalacoes({ linhas, mostrarSoftware }: { linhas: Instalacao[]; mostrarSoftware?: boolean }) {
  return (
    <Table striped fz="sm">
      <Table.Thead>
        <Table.Tr>
          {mostrarSoftware && <Table.Th>Software</Table.Th>}
          <Table.Th>Patrimônio</Table.Th>
          <Table.Th>Hostname</Table.Th>
          <Table.Th>IP</Table.Th>
          <Table.Th>Responsável</Table.Th>
          <Table.Th>Nome instalado</Table.Th>
          <Table.Th>Versão</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {linhas.map((l, i) => (
          <Table.Tr key={i}>
            {mostrarSoftware && (
              <Table.Td>
                <Badge color="red" variant="light">
                  {l.nomeCanonico}
                </Badge>
              </Table.Td>
            )}
            <Table.Td>
              <Anchor component={Link} href={`/inventario/${l.itemId}`} size="sm" fw={600}>
                {l.numeroPatrimonio}
              </Anchor>
            </Table.Td>
            <Table.Td>{l.hostname}</Table.Td>
            <Table.Td className="mono">{l.ip}</Table.Td>
            <Table.Td>{l.funcionarioNome ?? '—'}</Table.Td>
            <Table.Td>{l.software}</Table.Td>
            <Table.Td>{l.versao}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function OndeInstalado() {
  const { data: entradas = [] } = useQuery({ queryKey: ['dicionario'], queryFn: () => api<Entrada[]>('/api/dicionario') });
  const [dicionarioId, setDicionarioId] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [nomeQ] = useDebouncedValue(nome, 400);
  const ativo = !!dicionarioId || nomeQ.trim().length >= 2;
  const { data = [], isFetching } = useQuery({
    queryKey: ['onde-instalado', dicionarioId, nomeQ],
    queryFn: () => api<Instalacao[]>(`/api/dicionario/onde-instalado${qs(dicionarioId ? { dicionarioId } : { nome: nomeQ })}`),
    enabled: ativo,
  });
  return (
    <Stack>
      <Group>
        <Select
          placeholder="Software do dicionário"
          searchable
          clearable
          data={entradas.map((e) => ({ value: String(e.id), label: e.nomeCanonico }))}
          value={dicionarioId}
          onChange={(v) => {
            setDicionarioId(v);
            if (v) setNome('');
          }}
          w={280}
        />
        <Text size="sm">ou</Text>
        <TextInput
          placeholder="Texto livre (ex.: java)"
          leftSection={<IconSearch size={16} />}
          value={nome}
          onChange={(e) => {
            setNome(e.currentTarget.value);
            setDicionarioId(null);
          }}
          w={260}
        />
        {ativo && <Text size="sm">{isFetching ? 'buscando…' : `${data.length} instalação(ões)`}</Text>}
      </Group>
      {ativo && <TabelaInstalacoes linhas={data} />}
    </Stack>
  );
}

function Proibidos() {
  const { data = [] } = useQuery({ queryKey: ['proibidos'], queryFn: () => api<Instalacao[]>('/api/dicionario/proibidos') });
  if (!data.length) return <Alert color="teal">Nenhum software proibido encontrado nos itens inventariados.</Alert>;
  return (
    <Stack>
      <Alert color="red" icon={<IconAlertTriangle size={18} />}>
        {new Set(data.map((d) => d.itemId)).size} máquina(s) com software marcado como proibido.
      </Alert>
      <TabelaInstalacoes linhas={data} mostrarSoftware />
    </Stack>
  );
}

export default function SoftwarePage() {
  const { data: proibidos = [] } = useQuery({ queryKey: ['proibidos'], queryFn: () => api<Instalacao[]>('/api/dicionario/proibidos') });
  return (
    <Stack>
      <Title order={3}>Software</Title>
      <Tabs defaultValue="dicionario" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="dicionario">Dicionário</Tabs.Tab>
          <Tabs.Tab value="nao">Não classificados</Tabs.Tab>
          <Tabs.Tab value="onde">Onde está instalado</Tabs.Tab>
          <Tabs.Tab
            value="proibidos"
            rightSection={
              proibidos.length ? (
                <Badge size="xs" color="red" circle>
                  {new Set(proibidos.map((p) => p.itemId)).size}
                </Badge>
              ) : null
            }
          >
            Proibidos
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="dicionario" pt="md">
          <Dicionario />
        </Tabs.Panel>
        <Tabs.Panel value="nao" pt="md">
          <NaoClassificados />
        </Tabs.Panel>
        <Tabs.Panel value="onde" pt="md">
          <OndeInstalado />
        </Tabs.Panel>
        <Tabs.Panel value="proibidos" pt="md">
          <Proibidos />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
