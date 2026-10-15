'use client';

import {
  ActionIcon,
  Alert,
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
  IconFilter,
  IconLayoutGrid,
  IconNetwork,
  IconRefresh,
  IconSearch,
  IconServer2,
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
  type DensidadeNo,
  type DirecaoLayout,
  type Estrutura,
  type Servidor,
  type TipoVisao,
} from '@/lib/mermaid-estrutura';

type Workspace = { id: number; name: string; hosts: number };

const COR: Record<Categoria, string> = { ad: 'yellow', banco: 'cyan', web: 'blue' };

export default function EstruturaPage() {
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [aba, setAba] = useState<string | null>('diagrama'); // Diagrama como primeira opção após a melhoria

  // Opções de visualização do diagrama arquitetural Mermaid
  const [visao, setVisao] = useState<TipoVisao>('topologia');
  const [densidade, setDensidade] = useState<DensidadeNo>('compacto');
  const [direcao, setDirecao] = useState<DirecaoLayout>('TB');
  const [categoriaFiltro, setCategoriaFiltro] = useState<Categoria | 'todas'>('todas');
  const [filtroTexto, setFiltroTexto] = useState<string>('');

  const { data: workspaces = [] } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api<Workspace[]>('/api/msf/workspaces'),
  });

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['estrutura', workspaceId],
    queryFn: () => api<Estrutura>(`/api/msf/estrutura${qs({ workspaceId })}`),
  });

  // Gera o código Mermaid otimizado de acordo com o modo de visualização e filtros
  const mermaid = useMemo(() => {
    if (!data) return '';
    return gerarMermaidEstrutura(data, {
      visao,
      densidade,
      direcao,
      categoriaFiltro,
      filtroTexto,
      isDark,
    });
  }, [data, visao, densidade, direcao, categoriaFiltro, filtroTexto, isDark]);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <div>
          <Title order={3}>Estrutura de servidores</Title>
          <Text size="sm" c="dimmed">
            Mapa dos servidores classificados por função a partir das portas abertas — lido direto do Metasploit.
            {data && ` Gerado em ${fmtDataHora(data.geradoEm)} · ${data.total} servidores.`}
          </Text>
        </div>
        <Group gap="xs">
          <Select
            w={240}
            placeholder="Todos os workspaces"
            clearable
            data={workspaces.map((w) => ({ value: String(w.id), label: `${w.name} (${w.hosts} hosts)` }))}
            value={workspaceId}
            onChange={setWorkspaceId}
          />
          <Tooltip label="Reler a estrutura atual do msf">
            <ActionIcon variant="default" size="lg" onClick={() => refetch()} loading={isFetching} aria-label="Atualizar">
              <IconRefresh size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {error && (
        <Alert color="red" icon={<IconAlertTriangle size={18} />} title="Não foi possível ler o msf">
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
          Nenhum servidor com portas abertas encontrado. Rode <span className="mono">db_nmap</span> no Kali ou troque o workspace.
        </Alert>
      )}

      {data && data.grupos.length > 0 && (
        <Tabs value={aba} onChange={setAba} keepMounted={false}>
          <Tabs.List>
            <Tabs.Tab value="diagrama" leftSection={<IconSitemap size={16} />}>
              Diagrama Arquitetural
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
                        { label: '🌐 Topologia Geral', value: 'topologia' },
                        { label: '🖥️ Grade de Racks', value: 'grade' },
                        { label: '🖧 Por Sub-rede', value: 'subrede' },
                      ]}
                    />
                  </Group>

                  {/* Filtro de Categoria e Busca (relevante na Grade e Sub-rede) */}
                  <Group gap="xs">
                    {visao === 'grade' && (
                      <>
                        <Select
                          size="xs"
                          w={190}
                          leftSection={<IconFilter size={14} />}
                          value={categoriaFiltro}
                          onChange={(v) => setCategoriaFiltro((v as Categoria | 'todas') ?? 'todas')}
                          data={[
                            { value: 'todas', label: `Todas as Zonas (${data.total})` },
                            {
                              value: 'ad',
                              label: `🏢 AD (${data.grupos.find((g) => g.categoria === 'ad')?.servidores.length ?? 0})`,
                            },
                            {
                              value: 'banco',
                              label: `🗄️ Bancos (${data.grupos.find((g) => g.categoria === 'banco')?.servidores.length ?? 0})`,
                            },
                            {
                              value: 'web',
                              label: `🚀 Web (${data.grupos.find((g) => g.categoria === 'web')?.servidores.length ?? 0})`,
                            },
                          ]}
                        />

                        <TextInput
                          size="xs"
                          w={170}
                          placeholder="Buscar IP ou porta..."
                          leftSection={<IconSearch size={14} />}
                          value={filtroTexto}
                          onChange={(e) => setFiltroTexto(e.currentTarget.value)}
                        />
                      </>
                    )}

                    {/* Densidade dos cards */}
                    <SegmentedControl
                      size="xs"
                      value={densidade}
                      onChange={(v) => setDensidade(v as DensidadeNo)}
                      data={[
                        { label: 'Lâmina Compacta', value: 'compacto' },
                        { label: 'Expandido', value: 'detalhado' },
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

              {/* Visualizador Mermaid interativo */}
              <MermaidViewer code={mermaid} titulo="Topologia de Infraestrutura de Servidores" />
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
                      {g.servidores.length} servidor(es)
                    </Text>
                  </Group>
                  <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
                    {g.servidores.map((s) => (
                      <ServidorCard key={s.id} servidor={s} cor={COR[g.categoria]} />
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
  return (
    <Card withBorder padding="sm" radius="md" style={{ borderLeft: `3px solid var(--mantine-color-${cor}-6)` }}>
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Text fw={700} className="mono">
          {s.address}
        </Text>
        <Badge size="xs" variant="dot" color={s.state === 'alive' ? 'teal' : 'gray'}>
          {s.state ?? '?'}
        </Badge>
      </Group>
      <Text size="sm" lineClamp={1}>
        {s.name ?? '—'}
      </Text>
      {s.os && (
        <Text size="xs" c="dimmed" lineClamp={1}>
          {s.os}
        </Text>
      )}
      <Stack gap={2} mt="xs">
        {s.portas.map((p) => (
          <Text key={`${p.port}/${p.proto}`} size="xs" className="mono">
            <Text span c={cor} fw={600}>
              {p.port}
            </Text>
            {p.name ? ` ${p.name}` : ''}
          </Text>
        ))}
      </Stack>
      {s.updatedAt && (
        <Text size="xs" c="dimmed" mt="xs">
          visto {fmtRelativo(s.updatedAt)}
        </Text>
      )}
    </Card>
  );
}
