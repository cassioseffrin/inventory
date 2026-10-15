'use client';

import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Center,
  Checkbox,
  Grid,
  Group,
  Loader,
  MultiSelect,
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
  Tooltip,
  useMantineColorScheme,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconDevices,
  IconExternalLink,
  IconFilter,
  IconFilterOff,
  IconFolders,
  IconLayoutGrid,
  IconRefresh,
  IconSearch,
  IconServer2,
  IconShieldCheck,
  IconSitemap,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { MermaidViewer } from '@/components/estrutura/MermaidViewer';
import { api, mensagemErro, qs } from '@/lib/api';
import { fmtDataHora, fmtRelativo } from '@/lib/format';
import {
  filtrarServidores,
  gerarMermaidEstrutura,
  obterSubrede,
  type Categoria,
  type CriterioAgrupamento,
  type DensidadeNo,
  type DirecaoLayout,
  type Estrutura,
  type FiltroInventario,
  type Servidor,
  type TipoVisao,
} from '@/lib/mermaid-estrutura';

type Workspace = { id: number; name: string; hosts: number };

type EstadoHost = 'todos' | 'alive' | 'outros';

type FiltrosCartoes = {
  subredes: string[];
  inventario: FiltroInventario;
  estado: EstadoHost;
  tipos: string[];
  sistemas: string[];
  setores: string[];
  texto: string;
};

const FILTROS_CARTOES_VAZIOS: FiltrosCartoes = {
  subredes: [],
  inventario: 'todos',
  estado: 'todos',
  tipos: [],
  sistemas: [],
  setores: [],
  texto: '',
};

const SEM_VALOR = '(não informado)';

/** Ordena sub-redes /24 numericamente pelos octetos (192.168.2.0 antes de 192.168.10.0). */
function compararSubredes(a: string, b: string): number {
  const na = a.split(/[./]/).map(Number);
  const nb = b.split(/[./]/).map(Number);
  for (let i = 0; i < 4; i++) {
    const d = (na[i] ?? Infinity) - (nb[i] ?? Infinity);
    if (d) return d;
  }
  return a.localeCompare(b);
}

/** Conta ocorrências de cada valor e devolve opções "valor (n)" ordenadas. */
function opcoesComContagem(valores: string[], ordenar: (a: string, b: string) => number = (a, b) => a.localeCompare(b)) {
  const contagem = new Map<string, number>();
  for (const v of valores) contagem.set(v, (contagem.get(v) ?? 0) + 1);
  return [...contagem.entries()].sort(([a], [b]) => ordenar(a, b)).map(([valor, n]) => ({ valor, n }));
}

const COR: Record<string, string> = {
  ad: 'yellow',
  banco: 'cyan',
  web: 'blue',
  servidor: 'blue',
  desktop: 'indigo',
  impressora: 'cyan',
  switch: 'violet',
  smart_pos: 'orange',
  outro: 'gray',
};

export default function EstruturaPage() {
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [aba, setAba] = useState<string | null>('diagrama');

  // Fonte de dados e escopo do inventário
  const [escopo, setEscopo] = useState<'todos_inventario' | 'apenas_msf'>('todos_inventario');

  // Opções de visualização do diagrama arquitetural Mermaid
  const [visao, setVisao] = useState<TipoVisao>('grade');
  const [densidade, setDensidade] = useState<DensidadeNo>('compacto');
  const [direcao, setDirecao] = useState<DirecaoLayout>('TB');
  const [criterioAgrupamento, setCriterioAgrupamento] = useState<CriterioAgrupamento>('tipo_inventario');
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('todas');
  const [filtroInventario, setFiltroInventario] = useState<FiltroInventario>('todos');
  const [filtroTexto, setFiltroTexto] = useState<string>('');

  // Filtros da aba de cartões detalhados
  const [filtrosCartoes, setFiltrosCartoes] = useState<FiltrosCartoes>(FILTROS_CARTOES_VAZIOS);
  const setFiltro = <K extends keyof FiltrosCartoes>(chave: K, valor: FiltrosCartoes[K]) =>
    setFiltrosCartoes((f) => ({ ...f, [chave]: valor }));

  const { data: workspaces = [] } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api<Workspace[]>('/api/msf/workspaces'),
  });

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['estrutura', workspaceId, escopo],
    queryFn: () => api<Estrutura>(`/api/msf/estrutura${qs({ workspaceId, escopo })}`),
  });

  // Opções do filtro de categorias conforme o critério de agrupamento selecionado
  const opcoesFiltroCategoria = useMemo(() => {
    if (!data) return [{ value: 'todas', label: 'Todas as Categorias' }];

    if (criterioAgrupamento === 'tipo_inventario' && data.gruposTipo) {
      return [
        { value: 'todas', label: `Todos os Tipos (${data.total})` },
        ...data.gruposTipo.map((g) => ({
          value: g.chave,
          label: `${g.icone} ${g.label} (${g.servidores.length})`,
        })),
      ];
    }

    if (criterioAgrupamento === 'setor' && data.gruposSetor) {
      return [
        { value: 'todas', label: `Todos os Setores (${data.total})` },
        ...data.gruposSetor.map((g) => ({
          value: g.chave,
          label: `📍 ${g.label} (${g.servidores.length})`,
        })),
      ];
    }

    return [
      { value: 'todas', label: `Todas as Zonas (${data.total})` },
      ...data.grupos.map((g) => ({
        value: g.categoria,
        label: `${g.label} (${g.servidores.length})`,
      })),
    ];
  }, [data, criterioAgrupamento]);

  // Opções dos filtros dos cartões, derivadas de todos os equipamentos carregados
  const opcoesCartoes = useMemo(() => {
    const todos = data?.grupos.flatMap((g) => g.servidores) ?? [];
    return {
      total: todos.length,
      subredes: opcoesComContagem(todos.map((s) => obterSubrede(s.address)), compararSubredes),
      tipos: opcoesComContagem(todos.map((s) => s.inventario?.tipo || SEM_VALOR)),
      sistemas: opcoesComContagem(todos.map((s) => s.os || SEM_VALOR)),
      setores: opcoesComContagem(todos.map((s) => s.inventario?.setor || SEM_VALOR)),
    };
  }, [data]);

  const gruposFiltrados = useMemo(() => {
    if (!data) return [];
    const f = filtrosCartoes;
    return data.grupos
      .map((g) => ({
        ...g,
        servidores: filtrarServidores(g.servidores, { filtroInventario: f.inventario, filtroTexto: f.texto }).filter(
          (s) =>
            (!f.subredes.length || f.subredes.includes(obterSubrede(s.address))) &&
            (f.estado === 'todos' || (f.estado === 'alive') === (s.state === 'alive')) &&
            (!f.tipos.length || f.tipos.includes(s.inventario?.tipo || SEM_VALOR)) &&
            (!f.sistemas.length || f.sistemas.includes(s.os || SEM_VALOR)) &&
            (!f.setores.length || f.setores.includes(s.inventario?.setor || SEM_VALOR)),
        ),
      }))
      .filter((g) => g.servidores.length > 0);
  }, [data, filtrosCartoes]);

  const totalFiltrado = gruposFiltrados.reduce((n, g) => n + g.servidores.length, 0);
  const filtrosAtivos =
    filtrosCartoes.subredes.length +
    filtrosCartoes.tipos.length +
    filtrosCartoes.sistemas.length +
    filtrosCartoes.setores.length +
    (filtrosCartoes.inventario !== 'todos' ? 1 : 0) +
    (filtrosCartoes.estado !== 'todos' ? 1 : 0) +
    (filtrosCartoes.texto.trim() ? 1 : 0);

  // Gera o código Mermaid enriquecido e interativo com links para o inventário
  const mermaid = useMemo(() => {
    if (!data) return '';
    return gerarMermaidEstrutura(data, {
      visao,
      densidade,
      direcao,
      categoriaFiltro,
      criterioAgrupamento,
      filtroInventario,
      filtroTexto,
      isDark,
    });
  }, [data, visao, densidade, direcao, categoriaFiltro, criterioAgrupamento, filtroInventario, filtroTexto, isDark]);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <div>
          <Title order={3}>Estrutura & Topologia do Inventário</Title>
          <Text size="sm" c="dimmed">
            Infraestrutura de equipamentos com cruzamento em tempo real do Inventário de TI e varreduras de rede.
            {data && ` Total: ${data.total} equipamentos conectados.`}
          </Text>

          {/* Resumo do cruzamento com o inventário */}
          {data?.resumoInventario && (
            <Group gap="xs" mt={6} wrap="wrap">
              <Badge variant="light" color="blue" size="sm" leftSection={<IconShieldCheck size={13} />}>
                {data.resumoInventario.inventariados} Equipamentos Catalogados no Inventário
              </Badge>
              {data.resumoInventario.shadowIt > 0 ? (
                <Badge variant="filled" color="red" size="sm">
                  🚨 {data.resumoInventario.shadowIt} Shadow IT (Sem Patrimônio)
                </Badge>
              ) : (
                <Badge variant="light" color="teal" size="sm">
                  ✅ 100% dos Dispositivos Inventariados
                </Badge>
              )}
              {data.resumoInventario.totalApenasInventario ? (
                <Badge variant="outline" color="gray" size="sm">
                  📦 +{data.resumoInventario.totalApenasInventario} itens cadastrados (estações, impressoras)
                </Badge>
              ) : null}
            </Group>
          )}
        </div>

        <Group gap="xs">
          <Select
            w={230}
            placeholder="Todos os workspaces"
            clearable
            data={workspaces.map((w) => ({ value: String(w.id), label: `${w.name} (${w.hosts} hosts)` }))}
            value={workspaceId}
            onChange={setWorkspaceId}
          />
          <Tooltip label="Atualizar dados">
            <ActionIcon variant="default" size="lg" onClick={() => refetch()} loading={isFetching} aria-label="Atualizar">
              <IconRefresh size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {error && (
        <Alert color="red" icon={<IconAlertTriangle size={18} />} title="Não foi possível carregar os dados">
          {mensagemErro(error)}
        </Alert>
      )}

      {isLoading && (
        <Center mih={240}>
          <Loader />
        </Center>
      )}

      {data && !data.grupos.length && !isLoading && (
        <Alert color="gray" icon={<IconServer2 size={18} />}>
          Nenhum equipamento encontrado para o filtro selecionado.
        </Alert>
      )}

      {data && data.total > 0 && (
        <Tabs value={aba} onChange={setAba} keepMounted={false}>
          <Tabs.List>
            <Tabs.Tab value="diagrama" leftSection={<IconSitemap size={16} />}>
              Diagrama do Inventário
            </Tabs.Tab>
            <Tabs.Tab value="cartoes" leftSection={<IconLayoutGrid size={16} />}>
              Cartões Detalhados
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="diagrama" pt="md">
            <Stack gap="xs">
              {/* Barra de controle e personalização da arquitetura Mermaid */}
              <Paper withBorder p="xs" radius="md">
                <Group justify="space-between" wrap="wrap" gap="sm">
                  {/* Seletor de Modo de Visualização */}
                  <Group gap="xs">
                    <Text size="xs" fw={600} c="dimmed">
                      Modo:
                    </Text>
                    <SegmentedControl
                      size="xs"
                      value={visao}
                      onChange={(val) => setVisao(val as TipoVisao)}
                      data={[
                        { label: '🖥️ Grade de Racks', value: 'grade' },
                        { label: '🖧 Por Sub-rede', value: 'subrede' },
                        { label: '🌐 Topologia Geral', value: 'topologia' },
                      ]}
                    />
                  </Group>

                  {/* Escopo da Fonte de Dados: Todos os Equipamentos vs Apenas Servidores MSF */}
                  <Group gap="xs">
                    <Text size="xs" fw={600} c="dimmed">
                      Base:
                    </Text>
                    <SegmentedControl
                      size="xs"
                      value={escopo}
                      onChange={(val) => setEscopo(val as 'todos_inventario' | 'apenas_msf')}
                      data={[
                        { label: '📦 Inventário Completo', value: 'todos_inventario' },
                        { label: '📡 Servidores MSF', value: 'apenas_msf' },
                      ]}
                    />
                  </Group>

                  {/* Agrupamento dos Racks na Grade */}
                  {visao === 'grade' && (
                    <Group gap="xs">
                      <Text size="xs" fw={600} c="dimmed">
                        Agrupar Racks:
                      </Text>
                      <SegmentedControl
                        size="xs"
                        value={criterioAgrupamento}
                        onChange={(val) => {
                          setCriterioAgrupamento(val as CriterioAgrupamento);
                          setCategoriaFiltro('todas');
                        }}
                        data={[
                          { label: '🏷️ Tipo de Equipamento', value: 'tipo_inventario' },
                          { label: '🏢 Função de Portas', value: 'funcao' },
                          { label: '📍 Por Setor', value: 'setor' },
                        ]}
                      />
                    </Group>
                  )}

                  {/* Filtros e Busca */}
                  <Group gap="xs">
                    {/* Filtro específico do grupo selecionado */}
                    {visao === 'grade' && (
                      <Select
                        size="xs"
                        w={180}
                        leftSection={<IconFilter size={14} />}
                        value={categoriaFiltro}
                        onChange={(v) => setCategoriaFiltro(v ?? 'todas')}
                        data={opcoesFiltroCategoria}
                      />
                    )}

                    {/* Filtro por Situação de Inventário (Todos / Inventariados / Shadow IT) */}
                    <Select
                      size="xs"
                      w={175}
                      value={filtroInventario}
                      onChange={(v) => setFiltroInventario((v as FiltroInventario) ?? 'todos')}
                      data={[
                        { value: 'todos', label: 'Todos os Status' },
                        { value: 'inventariados', label: `🛡️ Inventariados (${data.resumoInventario?.inventariados ?? 0})` },
                        { value: 'shadow_it', label: `🚨 Shadow IT (${data.resumoInventario?.shadowIt ?? 0})` },
                      ]}
                    />

                    {/* Campo de Busca Rápida (IP, Porta, Patrimônio, Setor, Responsável) */}
                    <TextInput
                      size="xs"
                      w={190}
                      placeholder="Buscar IP, patrimônio, setor..."
                      leftSection={<IconSearch size={14} />}
                      value={filtroTexto}
                      onChange={(e) => setFiltroTexto(e.currentTarget.value)}
                    />

                    {/* Densidade dos cards */}
                    <SegmentedControl
                      size="xs"
                      value={densidade}
                      onChange={(v) => setDensidade(v as DensidadeNo)}
                      data={[
                        { label: 'Lâmina', value: 'compacto' },
                        { label: 'Detalhado', value: 'detalhado' },
                      ]}
                    />

                    {/* Orientação do diagrama */}
                    <SegmentedControl
                      size="xs"
                      value={direcao}
                      onChange={(v) => setDirecao(v as DirecaoLayout)}
                      data={[
                        { label: 'Vertical (TB)', value: 'TB' },
                        { label: 'Horizontal (LR)', value: 'LR' },
                      ]}
                    />
                  </Group>
                </Group>
              </Paper>

              {/* Dica de usabilidade interativa */}
              <Text size="xs" c="dimmed" ta="right">
                💡 Dica: Clique em qualquer card do diagrama para abrir diretamente a ficha do equipamento no Inventário de TI.
              </Text>

              {/* Visualizador Mermaid interativo */}
              <MermaidViewer code={mermaid} titulo="Topologia de Infraestrutura & Inventário de TI" />
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="cartoes" pt="md">
            <Grid gutter="md" align="flex-start">
              <Grid.Col span={{ base: 12, md: 8, xl: 9 }} order={{ base: 2, md: 1 }}>
                <Stack>
                  {gruposFiltrados.length === 0 && (
                    <Alert color="gray" icon={<IconFilter size={18} />}>
                      Nenhum equipamento corresponde aos filtros selecionados.
                    </Alert>
                  )}
                  {gruposFiltrados.map((g) => (
                    <Card key={g.categoria} withBorder padding="md">
                      <Group gap="xs" mb="sm">
                        <Badge size="lg" color={COR[g.categoria]} variant="filled">
                          {g.label}
                        </Badge>
                        <Text size="sm" c="dimmed">
                          {g.servidores.length} equipamento(s)
                        </Text>
                      </Group>
                      <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }} spacing="sm">
                        {g.servidores.map((s) => (
                          <ServidorCard key={s.id} servidor={s} cor={COR[s.inventario?.tipo ?? g.categoria] ?? 'blue'} />
                        ))}
                      </SimpleGrid>
                    </Card>
                  ))}
                </Stack>
              </Grid.Col>

              <Grid.Col span={{ base: 12, md: 4, xl: 3 }} order={{ base: 1, md: 2 }}>
                <Paper withBorder p="sm" radius="md" style={{ position: 'sticky', top: 'calc(var(--app-shell-header-height, 60px) + 12px)' }}>
                  <Stack gap="sm">
                    <Group justify="space-between">
                      <Group gap={6}>
                        <IconFilter size={16} />
                        <Text fw={600} size="sm">
                          Filtros
                        </Text>
                      </Group>
                      <Text size="xs" c="dimmed">
                        {totalFiltrado} de {opcoesCartoes.total}
                      </Text>
                    </Group>

                    <TextInput
                      size="xs"
                      placeholder="Buscar IP, nome, porta, patrimônio..."
                      leftSection={<IconSearch size={14} />}
                      value={filtrosCartoes.texto}
                      onChange={(e) => setFiltro('texto', e.currentTarget.value)}
                    />

                    <div>
                      <Group justify="space-between" mb={4}>
                        <Text size="xs" fw={600} c="dimmed">
                          🖧 Sub-rede
                        </Text>
                        {filtrosCartoes.subredes.length > 0 && (
                          <Anchor size="xs" component="button" onClick={() => setFiltro('subredes', [])}>
                            limpar
                          </Anchor>
                        )}
                      </Group>
                      <ScrollArea.Autosize mah={220} type="auto">
                        <Checkbox.Group value={filtrosCartoes.subredes} onChange={(v) => setFiltro('subredes', v)}>
                          <Stack gap={6}>
                            {opcoesCartoes.subredes.map(({ valor, n }) => (
                              <Checkbox
                                key={valor}
                                size="xs"
                                value={valor}
                                label={
                                  <Group gap={6} wrap="nowrap">
                                    <Text size="xs" className="mono">
                                      {valor}
                                    </Text>
                                    <Badge size="xs" variant="light" color="gray">
                                      {n}
                                    </Badge>
                                  </Group>
                                }
                              />
                            ))}
                          </Stack>
                        </Checkbox.Group>
                      </ScrollArea.Autosize>
                    </div>

                    <div>
                      <Text size="xs" fw={600} c="dimmed" mb={4}>
                        Situação no inventário
                      </Text>
                      <SegmentedControl
                        size="xs"
                        fullWidth
                        value={filtrosCartoes.inventario}
                        onChange={(v) => setFiltro('inventario', v as FiltroInventario)}
                        data={[
                          { label: 'Todos', value: 'todos' },
                          { label: 'Inventariados', value: 'inventariados' },
                          { label: 'Shadow IT', value: 'shadow_it' },
                        ]}
                      />
                    </div>

                    <div>
                      <Text size="xs" fw={600} c="dimmed" mb={4}>
                        Estado no scan
                      </Text>
                      <SegmentedControl
                        size="xs"
                        fullWidth
                        value={filtrosCartoes.estado}
                        onChange={(v) => setFiltro('estado', v as EstadoHost)}
                        data={[
                          { label: 'Todos', value: 'todos' },
                          { label: 'Alive', value: 'alive' },
                          { label: 'Outros', value: 'outros' },
                        ]}
                      />
                    </div>

                    <MultiSelect
                      size="xs"
                      label="Tipo de equipamento"
                      placeholder="Todos"
                      clearable
                      data={opcoesCartoes.tipos.map(({ valor, n }) => ({ value: valor, label: `${valor} (${n})` }))}
                      value={filtrosCartoes.tipos}
                      onChange={(v) => setFiltro('tipos', v)}
                    />

                    <MultiSelect
                      size="xs"
                      label="Sistema operacional"
                      placeholder="Todos"
                      clearable
                      searchable
                      data={opcoesCartoes.sistemas.map(({ valor, n }) => ({ value: valor, label: `${valor} (${n})` }))}
                      value={filtrosCartoes.sistemas}
                      onChange={(v) => setFiltro('sistemas', v)}
                    />

                    <MultiSelect
                      size="xs"
                      label="Setor"
                      placeholder="Todos"
                      clearable
                      searchable
                      data={opcoesCartoes.setores.map(({ valor, n }) => ({ value: valor, label: `${valor} (${n})` }))}
                      value={filtrosCartoes.setores}
                      onChange={(v) => setFiltro('setores', v)}
                    />

                    <Button
                      size="xs"
                      variant="default"
                      leftSection={<IconFilterOff size={14} />}
                      disabled={filtrosAtivos === 0}
                      onClick={() => setFiltrosCartoes(FILTROS_CARTOES_VAZIOS)}
                    >
                      Limpar filtros{filtrosAtivos > 0 ? ` (${filtrosAtivos})` : ''}
                    </Button>
                  </Stack>
                </Paper>
              </Grid.Col>
            </Grid>
          </Tabs.Panel>
        </Tabs>
      )}
    </Stack>
  );
}

function ServidorCard({ servidor: s, cor }: { servidor: Servidor; cor: string }) {
  const inv = s.inventario;

  return (
    <Card withBorder padding="sm" radius="md" style={{ borderLeft: `3px solid var(--mantine-color-${cor}-6)` }}>
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Text fw={700} className="mono">
          {s.address}
        </Text>
        <Group gap={4}>
          {inv ? (
            <Anchor href={`/inventario/${inv.itemId}`} target="_blank" underline="never">
              <Badge size="xs" variant="light" color="blue" rightSection={<IconExternalLink size={10} />} style={{ cursor: 'pointer' }}>
                🏷️ {inv.numeroPatrimonio}
              </Badge>
            </Anchor>
          ) : (
            <Badge size="xs" variant="filled" color="red">
              🚨 Shadow IT
            </Badge>
          )}
          <Badge size="xs" variant="dot" color={s.state === 'alive' ? 'teal' : 'gray'}>
            {s.state ?? '?'}
          </Badge>
        </Group>
      </Group>

      <Text size="sm" lineClamp={1}>
        {s.name ?? (inv ? `Equipamento #${inv.numeroPatrimonio}` : '—')}
      </Text>

      {s.os && (
        <Text size="xs" c="dimmed" lineClamp={1}>
          {s.os}
        </Text>
      )}

      {inv?.setor && (
        <Text size="xs" c="blue" fw={500}>
          📍 Setor: {inv.setor}
        </Text>
      )}

      {inv?.responsavel && (
        <Text size="xs" c="dimmed">
          👤 Responsável: {inv.responsavel}
        </Text>
      )}

      {inv?.tipo && (
        <Text size="xs" c="dimmed">
          📦 Tipo: {inv.tipo}
        </Text>
      )}

      <Stack gap={2} mt="xs">
        {s.portas.length > 0 ? (
          s.portas.map((p) => (
            <Text key={`${p.port}/${p.proto}`} size="xs" className="mono">
              <Text span c={cor} fw={600}>
                {p.port}
              </Text>
              {p.name ? ` ${p.name}` : ''}
            </Text>
          ))
        ) : (
          <Text size="xs" c="dimmed">
            Sem portas mapeadas no scan
          </Text>
        )}
      </Stack>

      {s.updatedAt && (
        <Text size="xs" c="dimmed" mt="xs">
          visto {fmtRelativo(s.updatedAt)}
        </Text>
      )}
    </Card>
  );
}
