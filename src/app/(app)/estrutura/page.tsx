'use client';

import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Card,
  Center,
  Group,
  Loader,
  Paper,
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
  gerarMermaidEstrutura,
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

const COR: Record<string, string> = {
  ad: 'yellow',
  banco: 'cyan',
  web: 'blue',
  servidor: 'blue',
  desktop: 'indigo',
  impressora: 'cyan',
  switch: 'violet',
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
            <Stack>
              {data.grupos.map((g) => (
                <Card key={g.categoria} withBorder padding="md">
                  <Group gap="xs" mb="sm">
                    <Badge size="lg" color={COR[g.categoria]} variant="filled">
                      {g.label}
                    </Badge>
                    <Text size="sm" c="dimmed">
                      {g.servidores.length} equipamento(s)
                    </Text>
                  </Group>
                  <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
                    {g.servidores.map((s) => (
                      <ServidorCard key={s.id} servidor={s} cor={COR[s.inventario?.tipo ?? g.categoria] ?? 'blue'} />
                    ))}
                  </SimpleGrid>
                </Card>
              ))}
            </Stack>
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
