'use client';

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconBolt, IconDownload, IconEdit, IconList, IconPlus, IconTrash } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { api, mensagemErro } from '@/lib/api';
import { STATUS, STATUS_LABEL, TIPOS, TIPO_LABEL } from '@/lib/constants';
import type { Grupo } from '@/lib/types';

type Regra = { campo: string; operador: string; valor: string };

const CAMPOS: { value: string; label: string; ops: string[]; opcoes?: { value: string; label: string }[]; dica?: string }[] = [
  { value: 'osName', label: 'Sistema operacional', ops: ['contem', 'nao_contem', 'igual', 'diferente', 'comeca_com', 'vazio', 'nao_vazio'] },
  { value: 'osFamily', label: 'Família do SO', ops: ['igual', 'contem', 'vazio'] },
  { value: 'hostname', label: 'Hostname', ops: ['contem', 'nao_contem', 'igual', 'comeca_com', 'vazio', 'nao_vazio'] },
  { value: 'ip', label: 'IP', ops: ['na_subrede', 'igual', 'contem', 'vazio', 'nao_vazio'], dica: 'ex.: 192.168.10.0/24' },
  { value: 'mac', label: 'MAC', ops: ['comeca_com', 'contem', 'igual', 'vazio'], dica: 'prefixo do fabricante, ex.: 00:15:5d' },
  { value: 'tipo', label: 'Tipo', ops: ['igual', 'diferente'], opcoes: TIPOS.map((t) => ({ value: t, label: TIPO_LABEL[t] })) },
  { value: 'status', label: 'Status', ops: ['igual', 'diferente'], opcoes: STATUS.map((s) => ({ value: s, label: STATUS_LABEL[s] })) },
  { value: 'setor', label: 'Setor', ops: ['igual', 'diferente', 'contem', 'vazio', 'nao_vazio'] },
  { value: 'localizacao', label: 'Localização', ops: ['igual', 'contem', 'vazio'] },
  { value: 'tag', label: 'TAG', ops: ['igual', 'diferente', 'contem', 'vazio', 'nao_vazio'] },
  { value: 'fabricante', label: 'Fabricante', ops: ['igual', 'contem', 'vazio'] },
  { value: 'modelo', label: 'Modelo', ops: ['igual', 'contem', 'vazio'] },
  { value: 'funcionarioId', label: 'Responsável (id)', ops: ['vazio', 'nao_vazio', 'igual', 'diferente'] },
  { value: 'software', label: 'Software instalado', ops: ['contem', 'igual', 'nao_contem'], dica: 'nome ou nome canônico' },
  { value: 'diasSemVisto', label: 'Dias sem ser visto no msf', ops: ['maior', 'menor'], dica: 'número de dias' },
];
const OP_LABEL: Record<string, string> = {
  igual: 'é igual a',
  diferente: 'é diferente de',
  contem: 'contém',
  nao_contem: 'não contém',
  comeca_com: 'começa com',
  vazio: 'está vazio',
  nao_vazio: 'não está vazio',
  maior: 'maior que',
  menor: 'menor que',
  na_subrede: 'está na sub-rede',
};

function EditorCriterios({ combinacao, regras, onChange }: { combinacao: 'E' | 'OU'; regras: Regra[]; onChange: (c: 'E' | 'OU', r: Regra[]) => void }) {
  const upd = (i: number, r: Partial<Regra>) => onChange(combinacao, regras.map((x, j) => (j === i ? { ...x, ...r } : x)));
  return (
    <Stack gap="xs">
      <Group>
        <Text size="sm">Itens que atendem</Text>
        <SegmentedControl
          size="xs"
          value={combinacao}
          onChange={(v) => onChange(v as 'E' | 'OU', regras)}
          data={[
            { value: 'E', label: 'todas as regras (E)' },
            { value: 'OU', label: 'qualquer regra (OU)' },
          ]}
        />
      </Group>
      {regras.map((r, i) => {
        const def = CAMPOS.find((c) => c.value === r.campo)!;
        const semValor = r.operador === 'vazio' || r.operador === 'nao_vazio';
        return (
          <Group key={i} gap="xs" wrap="nowrap" align="flex-start">
            <Select
              w={220}
              allowDeselect={false}
              data={CAMPOS.map((c) => ({ value: c.value, label: c.label }))}
              value={r.campo}
              onChange={(v) => {
                const d = CAMPOS.find((c) => c.value === v)!;
                upd(i, { campo: v!, operador: d.ops[0], valor: '' });
              }}
            />
            <Select w={170} allowDeselect={false} data={def.ops.map((o) => ({ value: o, label: OP_LABEL[o] }))} value={r.operador} onChange={(v) => upd(i, { operador: v! })} />
            {!semValor &&
              (def.opcoes ? (
                <Select w={200} data={def.opcoes} value={r.valor || null} onChange={(v) => upd(i, { valor: v ?? '' })} />
              ) : (
                <TextInput style={{ flex: 1 }} placeholder={def.dica} value={r.valor} onChange={(e) => upd(i, { valor: e.currentTarget.value })} />
              ))}
            <ActionIcon variant="subtle" color="red" mt={6} onClick={() => onChange(combinacao, regras.filter((_, j) => j !== i))} disabled={regras.length === 1} aria-label="Remover regra">
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
        );
      })}
      <Button size="xs" variant="light" w="fit-content" leftSection={<IconPlus size={14} />} onClick={() => onChange(combinacao, [...regras, { campo: 'osName', operador: 'contem', valor: '' }])}>
        Regra
      </Button>
    </Stack>
  );
}

function GrupoModal({ inicial, onClose }: { inicial: Grupo | 'novo'; onClose: () => void }) {
  const qc = useQueryClient();
  const g = inicial === 'novo' ? null : inicial;
  const [tipo, setTipo] = useState<'estatico' | 'dinamico'>(g?.tipo ?? 'dinamico');
  const [nome, setNome] = useState(g?.nome ?? '');
  const [descricao, setDescricao] = useState(g?.descricao ?? '');
  const [combinacao, setCombinacao] = useState<'E' | 'OU'>(g?.criterios?.combinacao ?? 'E');
  const [regras, setRegras] = useState<Regra[]>(g?.criterios?.regras ?? [{ campo: 'osName', operador: 'contem', valor: '' }]);
  const [preview, setPreview] = useState<{ total: number; amostra: { id: number; numeroPatrimonio: string; hostname: string | null; osName: string | null }[] } | null>(null);

  const criterios = { combinacao, regras };
  const testar = async () => {
    try {
      setPreview(await api('/api/grupos/preview', { method: 'POST', json: criterios }));
    } catch (e) {
      notifications.show({ color: 'red', message: mensagemErro(e) });
    }
  };
  const salvar = async () => {
    try {
      const json = tipo === 'dinamico' ? { tipo, nome, descricao, criterios } : { tipo, nome, descricao };
      await api(g ? `/api/grupos/${g.id}` : '/api/grupos', { method: g ? 'PUT' : 'POST', json });
      qc.invalidateQueries({ queryKey: ['grupos'] });
      notifications.show({ color: 'teal', message: 'Grupo salvo' });
      onClose();
    } catch (e) {
      notifications.show({ color: 'red', message: mensagemErro(e) });
    }
  };

  return (
    <Modal opened onClose={onClose} title={g ? `Editar grupo ${g.nome}` : 'Novo grupo'} size="xl">
      <Stack>
        {!g && (
          <SegmentedControl
            value={tipo}
            onChange={(v) => setTipo(v as 'estatico' | 'dinamico')}
            data={[
              { value: 'dinamico', label: 'Dinâmico (consulta salva)' },
              { value: 'estatico', label: 'Estático (itens escolhidos)' },
            ]}
          />
        )}
        <TextInput label="Nome" withAsterisk value={nome} onChange={(e) => setNome(e.currentTarget.value)} />
        <Textarea label="Descrição" autosize value={descricao} onChange={(e) => setDescricao(e.currentTarget.value)} />
        {tipo === 'dinamico' ? (
          <Card withBorder>
            <EditorCriterios
              combinacao={combinacao}
              regras={regras}
              onChange={(c, r) => {
                setCombinacao(c);
                setRegras(r);
                setPreview(null);
              }}
            />
            <Group mt="sm">
              <Button size="xs" variant="default" onClick={testar}>
                Testar consulta
              </Button>
              {preview && (
                <Text size="sm">
                  <b>{preview.total}</b> item(ns): {preview.amostra.map((a) => a.numeroPatrimonio).join(', ')}
                  {preview.total > preview.amostra.length ? '…' : ''}
                </Text>
              )}
            </Group>
          </Card>
        ) : (
          <Alert variant="light">Depois de criado, adicione itens pela tela Inventário (selecione e “Adicionar ao grupo”) ou na importação em massa.</Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={!nome.trim()}>
            Salvar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default function GruposPage() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ['grupos'], queryFn: () => api<Grupo[]>('/api/grupos') });
  const [editar, setEditar] = useState<Grupo | 'novo' | null>(null);

  const descreverRegra = (r: Regra) => {
    const c = CAMPOS.find((x) => x.value === r.campo);
    return `${c?.label ?? r.campo} ${OP_LABEL[r.operador] ?? r.operador}${r.operador === 'vazio' || r.operador === 'nao_vazio' ? '' : ` “${r.valor}”`}`;
  };

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={3}>Grupos</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setEditar('novo')}>
          Novo grupo
        </Button>
      </Group>
      <Text size="sm" c="dimmed">
        Grupos estáticos têm itens escolhidos manualmente. Os dinâmicos são uma consulta salva, recalculada sempre que o grupo é aberto. Todos
        podem ser usados como filtro no inventário, na lista de hosts e na exportação CSV.
      </Text>
      {isLoading && <Text>Carregando…</Text>}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        {data.map((g) => (
          <Card key={g.id} withBorder>
            <Group justify="space-between" mb={4}>
              <Group gap="xs">
                {g.tipo === 'dinamico' ? <IconBolt size={18} /> : <IconList size={18} />}
                <Text fw={700}>{g.nome}</Text>
              </Group>
              <Badge variant="light">{g.total} itens</Badge>
            </Group>
            <Text size="xs" c="dimmed" mb="xs">
              {g.tipo === 'dinamico' ? 'Dinâmico' : 'Estático'}
              {g.descricao ? ` · ${g.descricao}` : ''}
            </Text>
            {g.criterios && (
              <Text size="xs" mb="xs">
                {g.criterios.regras.map(descreverRegra).join(g.criterios.combinacao === 'E' ? ' E ' : ' OU ')}
              </Text>
            )}
            <Group gap="xs">
              <Button size="compact-xs" component={Link} href={`/inventario?grupoId=${g.id}`}>
                Ver itens
              </Button>
              <Button size="compact-xs" variant="default" component="a" href={`/api/itens/export?grupoId=${g.id}`} leftSection={<IconDownload size={12} />}>
                CSV
              </Button>
              <ActionIcon variant="subtle" size="sm" onClick={() => setEditar(g)} aria-label="Editar">
                <IconEdit size={16} />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                color="red"
                size="sm"
                aria-label="Excluir"
                onClick={() =>
                  modals.openConfirmModal({
                    title: `Excluir grupo ${g.nome}?`,
                    children: <Text size="sm">Os itens não são afetados.</Text>,
                    labels: { confirm: 'Excluir', cancel: 'Cancelar' },
                    confirmProps: { color: 'red' },
                    onConfirm: async () => {
                      await api(`/api/grupos/${g.id}`, { method: 'DELETE' });
                      qc.invalidateQueries({ queryKey: ['grupos'] });
                    },
                  })
                }
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          </Card>
        ))}
      </SimpleGrid>
      {editar && <GrupoModal inicial={editar} onClose={() => setEditar(null)} />}
    </Stack>
  );
}
