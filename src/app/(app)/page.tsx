'use client';

import { Alert, Anchor, Card, Center, Group, Loader, Progress, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import {
  IconAlertTriangle,
  IconBox,
  IconCopy,
  IconEyeOff,
  IconHash,
  IconRadar,
  IconUserOff,
  IconBan,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { api } from '@/lib/api';
import { STATUS_LABEL, TIPO_LABEL } from '@/lib/constants';

type Contagem = { chave: string | null; total: number };
type Dashboard = {
  totais: {
    itens: number;
    semResponsavel: number;
    semPatrimonio: number;
    naoVistos30: number;
    funcionarios: number;
    duplicados: number;
    comSoftwareProibido: number;
    hostsMsf: number;
    hostsDesconhecidos: number;
  };
  msfErro?: string;
  porTipo: Contagem[];
  porStatus: Contagem[];
  porSetor: Contagem[];
  porSo: Contagem[];
  porFuncionario: Contagem[];
};

function Kpi({ label, valor, href, icon, alerta }: { label: string; valor: number; href: string; icon: ReactNode; alerta?: boolean }) {
  return (
    <Card withBorder component={Link} href={href} style={{ textDecoration: 'none' }}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {label}
          </Text>
          <Text fz={28} fw={700} c={alerta && valor > 0 ? 'orange' : undefined} lh={1.2}>
            {valor}
          </Text>
        </div>
        <Text c="dimmed">{icon}</Text>
      </Group>
    </Card>
  );
}

/** Barras horizontais simples: um único tom, rótulo e valor direto (sem legenda). */
function Barras({ titulo, dados, rotulo, href }: { titulo: string; dados: Contagem[]; rotulo?: (c: string) => string; href?: (c: string) => string }) {
  const max = Math.max(1, ...dados.map((d) => d.total));
  return (
    <Card withBorder>
      <Title order={6} mb="sm">
        {titulo}
      </Title>
      {!dados.length && (
        <Text size="sm" c="dimmed">
          Sem dados
        </Text>
      )}
      <Stack gap={8}>
        {dados.map((d) => {
          const nome = d.chave ? (rotulo ? rotulo(d.chave) : d.chave) : '—';
          return (
            <div key={d.chave ?? 'null'}>
              <Group justify="space-between" gap="xs" wrap="nowrap">
                {href && d.chave ? (
                  <Anchor component={Link} href={href(d.chave)} size="sm" truncate>
                    {nome}
                  </Anchor>
                ) : (
                  <Text size="sm" truncate>
                    {nome}
                  </Text>
                )}
                <Text size="sm" fw={600} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {d.total}
                </Text>
              </Group>
              <Progress value={(d.total / max) * 100} size="sm" mt={2} />
            </div>
          );
        })}
      </Stack>
    </Card>
  );
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/api/dashboard') });
  if (isLoading || !data)
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  const t = data.totais;

  return (
    <Stack>
      <Title order={3}>Dashboard</Title>
      {data.msfErro && (
        <Alert color="yellow" icon={<IconAlertTriangle size={18} />}>
          {data.msfErro}
        </Alert>
      )}
      <SimpleGrid cols={{ base: 2, sm: 3, lg: 4 }}>
        <Kpi label="Itens no inventário" valor={t.itens} href="/inventario" icon={<IconBox size={22} />} />
        <Kpi label="Hosts não identificados" valor={t.hostsDesconhecidos} href="/hosts" icon={<IconRadar size={22} />} alerta />
        <Kpi label="Sem responsável" valor={t.semResponsavel} href="/inventario?semResponsavel=true" icon={<IconUserOff size={22} />} alerta />
        <Kpi label="Sem patrimônio (provisório)" valor={t.semPatrimonio} href="/inventario?provisorio=true" icon={<IconHash size={22} />} alerta />
        <Kpi label="Não vistos há +30 dias" valor={t.naoVistos30} href="/inventario?naoVistoDias=30" icon={<IconEyeOff size={22} />} alerta />
        <Kpi label="Possíveis duplicados" valor={t.duplicados} href="/duplicados" icon={<IconCopy size={22} />} alerta />
        <Kpi label="Com software proibido" valor={t.comSoftwareProibido} href="/software" icon={<IconBan size={22} />} alerta />
        <Kpi label="Hosts no msf" valor={t.hostsMsf} href="/hosts" icon={<IconRadar size={22} />} />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }}>
        <Barras titulo="Por tipo" dados={data.porTipo} rotulo={(c) => TIPO_LABEL[c as keyof typeof TIPO_LABEL] ?? c} href={(c) => `/inventario?tipo=${c}`} />
        <Barras titulo="Por status" dados={data.porStatus} rotulo={(c) => STATUS_LABEL[c as keyof typeof STATUS_LABEL] ?? c} href={(c) => `/inventario?status=${c}`} />
        <Barras titulo="Por setor" dados={data.porSetor} href={(c) => (c === '(sem setor)' ? '/inventario' : `/inventario?setor=${encodeURIComponent(c)}`)} />
        <Barras titulo="Por sistema operacional" dados={data.porSo} href={(c) => `/inventario?q=${encodeURIComponent(c)}`} />
        <Barras titulo="Por funcionário (top 15)" dados={data.porFuncionario} />
      </SimpleGrid>
      <Text size="xs" c="dimmed">
        {t.funcionarios} funcionários ativos.
      </Text>
    </Stack>
  );
}
