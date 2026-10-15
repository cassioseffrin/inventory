'use client';

import { ActionIcon, AppShell, Badge, Burger, Group, NavLink, Text, Tooltip, useMantineColorScheme } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconApps,
  IconBox,
  IconCopy,
  IconDashboard,
  IconForms,
  IconLogout,
  IconMoon,
  IconRadar,
  IconServer2,
  IconSettings,
  IconSun,
  IconUsers,
  IconCategory,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { api } from '@/lib/api';
import type { Sessao } from '@/lib/types';

// `contador` é a chave em /api/menu/contadores; `alerta` destaca o badge quando o total é > 0
const LINKS: { href: string; label: string; icon: typeof IconBox; contador?: string; alerta?: boolean }[] = [
  { href: '/', label: 'Dashboard', icon: IconDashboard },
  { href: '/hosts', label: 'Hosts descobertos (msf)', icon: IconRadar, contador: 'hosts' },
  { href: '/estrutura', label: 'Estrutura de servidores', icon: IconServer2 },
  { href: '/inventario', label: 'Inventário', icon: IconBox, contador: 'inventario' },
  { href: '/funcionarios', label: 'Funcionários', icon: IconUsers, contador: 'funcionarios' },
  { href: '/grupos', label: 'Grupos', icon: IconCategory, contador: 'grupos' },
  { href: '/software', label: 'Software', icon: IconApps, contador: 'software' },
  { href: '/duplicados', label: 'Duplicados', icon: IconCopy, contador: 'duplicados', alerta: true },
  { href: '/campos', label: 'Campos customizados', icon: IconForms, contador: 'campos' },
  { href: '/configuracoes', label: 'Configurações', icon: IconSettings },
];

export function useSessao() {
  return useQuery({ queryKey: ['me'], queryFn: () => api<Sessao>('/api/auth/me'), staleTime: Infinity });
}

export function Shell({ children }: { children: ReactNode }) {
  const [aberto, { toggle, close }] = useDisclosure();
  const pathname = usePathname();
  const router = useRouter();
  const { data: sessao } = useSessao();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const { data: contadores } = useQuery({
    queryKey: ['menu-contadores'],
    queryFn: () => api<Record<string, number | null>>('/api/menu/contadores'),
    refetchInterval: 60_000,
  });

  const sair = async () => {
    await api('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  };

  return (
    <AppShell header={{ height: 52 }} navbar={{ width: 250, breakpoint: 'sm', collapsed: { mobile: !aberto } }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xs">
            <Burger opened={aberto} onClick={toggle} hiddenFrom="sm" size="sm" />
            <IconRadar size={22} />
            <Text fw={700}>Inventário de TI</Text>
          </Group>
          <Group gap="xs">
            <Text size="sm" c="dimmed" visibleFrom="xs">
              {sessao ? `${sessao.nome} (${sessao.papel})` : ''}
            </Text>
            <Tooltip label="Alternar tema">
              <ActionIcon variant="subtle" onClick={toggleColorScheme} aria-label="Alternar tema">
                {colorScheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Sair">
              <ActionIcon variant="subtle" color="red" onClick={sair} aria-label="Sair">
                <IconLogout size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="xs">
        {LINKS.map((l) => {
          const n = l.contador ? contadores?.[l.contador] : null;
          return (
            <NavLink
              key={l.href}
              component={Link}
              href={l.href}
              label={l.label}
              leftSection={<l.icon size={18} stroke={1.6} />}
              rightSection={
                n != null ? (
                  <Badge size="sm" variant="light" color={l.alerta && n > 0 ? 'orange' : 'gray'}>
                    {n.toLocaleString('pt-BR')}
                  </Badge>
                ) : null
              }
              active={l.href === '/' ? pathname === '/' : pathname.startsWith(l.href)}
              onClick={close}
            />
          );
        })}
      </AppShell.Navbar>
      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
