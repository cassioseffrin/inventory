'use client';

import { ActionIcon, Anchor, Badge, Box, Button, Card, Center, Group, Loader, Stack, Text } from '@mantine/core';
import { IconChevronDown, IconChevronRight, IconPoint } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';

type No = { id: number; nome: string; matricula: string; setor: string | null; gerenteId: number | null; admin: boolean; ativo: boolean; itens: number };

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Hierarquia de funcionários pelo gerenteId. Raiz = quem não tem gerente visível
 * (para o perfil gerente, os subordinados diretos dele).
 */
export function ArvoreFuncionarios({ busca, ativo }: { busca: string; ativo: 'true' | 'false' | 'todos' }) {
  const { data = [], isLoading } = useQuery({ queryKey: ['funcionarios', 'arvore'], queryFn: () => api<No[]>('/api/funcionarios/arvore') });
  const [abertos, setAbertos] = useState<Set<number> | null>(null);

  const { raizes, filhos, totalEquipe } = useMemo(() => {
    const ids = new Set(data.map((f) => f.id));
    const filhos = new Map<number, No[]>();
    const raizes: No[] = [];
    for (const f of data) {
      if (f.gerenteId && ids.has(f.gerenteId) && f.gerenteId !== f.id) {
        const l = filhos.get(f.gerenteId) ?? [];
        l.push(f);
        filhos.set(f.gerenteId, l);
      } else raizes.push(f);
    }
    // tamanho da equipe (todos os níveis abaixo); o conjunto visitado protege contra ciclos em dados ruins
    const totalEquipe = new Map<number, number>();
    const contar = (id: number, vistos: Set<number>): number => {
      if (totalEquipe.has(id)) return totalEquipe.get(id)!;
      vistos.add(id);
      let n = 0;
      for (const c of filhos.get(id) ?? []) if (!vistos.has(c.id)) n += 1 + contar(c.id, vistos);
      totalEquipe.set(id, n);
      return n;
    };
    for (const f of data) contar(f.id, new Set());
    return { raizes, filhos, totalEquipe };
  }, [data]);

  // com busca/filtro, mostra quem bate e toda a cadeia de gerentes acima dele
  const termo = normalizar(busca.trim());
  const filtrando = !!termo || ativo !== 'todos';
  const visiveis = useMemo(() => {
    if (!filtrando) return null;
    const porId = new Map(data.map((f) => [f.id, f]));
    const v = new Set<number>();
    for (const f of data) {
      const bate = (!termo || normalizar(f.nome).includes(termo) || normalizar(f.matricula).includes(termo)) && (ativo === 'todos' || String(f.ativo) === ativo);
      if (!bate) continue;
      let atual: No | undefined = f;
      while (atual && !v.has(atual.id)) {
        v.add(atual.id);
        atual = atual.gerenteId ? porId.get(atual.gerenteId) : undefined;
      }
    }
    return v;
  }, [data, termo, ativo, filtrando]);

  // padrão: só o primeiro nível aberto; buscando, tudo aberto para mostrar os resultados
  const aberto = (id: number) => (termo ? true : abertos ? abertos.has(id) : raizes.some((r) => r.id === id));
  const alternar = (id: number) =>
    setAbertos((a) => {
      const n = new Set(a ?? raizes.map((r) => r.id));
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const renderizar = (f: No, nivel: number, vistos: Set<number>): ReactNode => {
    if (vistos.has(f.id) || (visiveis && !visiveis.has(f.id))) return null;
    const prox = new Set(vistos).add(f.id);
    const sub = (filhos.get(f.id) ?? []).filter((c) => !visiveis || visiveis.has(c.id));
    const temSub = sub.length > 0;
    const equipe = totalEquipe.get(f.id) ?? 0;
    return (
      <Box key={f.id}>
        <Group gap={6} wrap="nowrap" py={4} pl={nivel * 24} opacity={f.ativo ? 1 : 0.55} style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
          {temSub ? (
            <ActionIcon variant="subtle" size="sm" onClick={() => alternar(f.id)} aria-label={aberto(f.id) ? 'Recolher' : 'Expandir'}>
              {aberto(f.id) ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
            </ActionIcon>
          ) : (
            <Center w={22}>
              <IconPoint size={12} color="var(--mantine-color-dimmed)" />
            </Center>
          )}
          <Anchor component={Link} href={`/funcionarios/${f.id}`} size="sm" fw={equipe ? 600 : 400}>
            {f.nome}
          </Anchor>
          <Text size="xs" c="dimmed" className="mono">
            {f.matricula}
          </Text>
          {f.setor && (
            <Text size="xs" c="dimmed" visibleFrom="sm">
              · {f.setor}
            </Text>
          )}
          {equipe > 0 && (
            <Badge size="xs" variant="light" color="blue">
              equipe {equipe}
            </Badge>
          )}
          {f.admin && (
            <Badge size="xs" variant="light" color="grape">
              admin
            </Badge>
          )}
          {!f.ativo && (
            <Badge size="xs" variant="light" color="gray">
              inativo
            </Badge>
          )}
          <Text size="xs" c="dimmed" ml="auto" style={{ whiteSpace: 'nowrap' }}>
            {f.itens} {f.itens === 1 ? 'item' : 'itens'}
          </Text>
        </Group>
        {temSub && aberto(f.id) && sub.map((c) => renderizar(c, nivel + 1, prox))}
      </Box>
    );
  };

  if (isLoading)
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );

  const linhas = raizes.map((r) => renderizar(r, 0, new Set()));
  return (
    <Stack gap="xs">
      {!termo && (
        <Group gap="xs">
          <Button size="xs" variant="default" onClick={() => setAbertos(new Set([...filhos.keys()]))}>
            Expandir tudo
          </Button>
          <Button size="xs" variant="default" onClick={() => setAbertos(new Set())}>
            Recolher tudo
          </Button>
        </Group>
      )}
      <Card withBorder p="xs">
        {linhas.some(Boolean) ? (
          linhas
        ) : (
          <Text size="sm" c="dimmed" ta="center" py="md">
            Nenhum funcionário encontrado.
          </Text>
        )}
      </Card>
    </Stack>
  );
}
