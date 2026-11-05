'use client';

import { ActionIcon, Anchor, Avatar, Badge, Button, Card, Center, Group, Loader, Select, Slider, Stack, Text, Title, Tooltip } from '@mantine/core';
import { IconChevronDown, IconChevronUp, IconCurrentLocation, IconMail, IconPhone, IconZoomIn } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useSessao } from '@/components/useSessao';
import { api } from '@/lib/api';
import css from '@/components/Organograma.module.css';

/** Só campos públicos: o endpoint não devolve CPF, celular, perfil nem dados de inventário. */
type Pessoa = { id: number; nome: string; setor: string | null; email: string | null; ramal: string | null; gerenteId: number | null; podeAbrir: boolean };

const CORES = ['blue', 'teal', 'grape', 'orange', 'cyan', 'pink', 'lime', 'indigo', 'red', 'yellow'];

/** Cor estável por setor, para dar para ver as áreas de relance. */
const corSetor = (setor: string | null) => {
  if (!setor) return 'gray';
  let h = 0;
  for (const c of setor.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CORES[h % CORES.length];
};

const iniciais = (nome: string) => {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
};

export default function OrganogramaPage() {
  const { data: sessao } = useSessao();
  const { data = [], isLoading } = useQuery({ queryKey: ['organograma'], queryFn: () => api<Pessoa[]>('/api/organograma') });
  const [foco, setFoco] = useState<string | null>(null);
  const [fechados, setFechados] = useState<Set<number>>(new Set());
  const [zoom, setZoom] = useState(100);

  const { porId, filhos, raizes, soltos, total } = useMemo(() => {
    const porId = new Map(data.map((p) => [p.id, p]));
    const filhos = new Map<number, Pessoa[]>();
    for (const p of data) {
      if (p.gerenteId && p.gerenteId !== p.id && porId.has(p.gerenteId)) {
        const l = filhos.get(p.gerenteId) ?? [];
        l.push(p);
        filhos.set(p.gerenteId, l);
      }
    }
    // equipe total (todos os níveis); `vistos` protege contra ciclo em dados ruins
    const total = new Map<number, number>();
    const contar = (id: number, vistos: Set<number>): number => {
      if (total.has(id)) return total.get(id)!;
      vistos.add(id);
      let n = 0;
      for (const c of filhos.get(id) ?? []) if (!vistos.has(c.id)) n += 1 + contar(c.id, vistos);
      total.set(id, n);
      return n;
    };
    data.forEach((p) => contar(p.id, new Set()));
    const topo = data.filter((p) => !p.gerenteId || !porId.has(p.gerenteId) || p.gerenteId === p.id);
    // quem não tem gerente nem equipe fica fora do gráfico, numa lista à parte
    return { porId, filhos, raizes: topo.filter((p) => filhos.has(p.id)), soltos: topo.filter((p) => !filhos.has(p.id)), total };
  }, [data]);

  // a raiz fica centralizada sobre a equipe: rola até o meio para ela aparecer
  const area = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = area.current;
    if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [foco, data, zoom, fechados]);

  const eu = sessao?.funcionarioId ? porId.get(sessao.funcionarioId) : undefined;
  const focado = foco ? porId.get(Number(foco)) : undefined;
  const exibidos = focado ? [focado] : raizes;

  // cadeia de gerentes acima do foco, mostrada como trilha
  const trilha = useMemo(() => {
    const t: Pessoa[] = [];
    const vistos = new Set<number>();
    let atual = focado?.gerenteId ? porId.get(focado.gerenteId) : undefined;
    while (atual && !vistos.has(atual.id)) {
      vistos.add(atual.id);
      t.unshift(atual);
      atual = atual.gerenteId ? porId.get(atual.gerenteId) : undefined;
    }
    return t;
  }, [focado, porId]);

  const alternar = (id: number) =>
    setFechados((f) => {
      const n = new Set(f);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const cartao = (p: Pessoa) => {
    const sub = filhos.get(p.id)?.length ?? 0;
    const cor = corSetor(p.setor);
    const nome = (
      <Text size="sm" fw={600} lh={1.2} lineClamp={2}>
        {p.nome}
      </Text>
    );
    return (
      <div className={`${css.cartao} ${p.id === eu?.id ? css.voce : ''}`} style={{ '--org-cor': `var(--mantine-color-${cor}-filled)` } as CSSProperties}>
        <Group gap={8} wrap="nowrap" align="flex-start">
          <Avatar size="sm" radius="xl" color={cor}>
            {iniciais(p.nome)}
          </Avatar>
          <div style={{ minWidth: 0, flex: 1 }}>
            {p.podeAbrir ? (
              <Anchor component={Link} href={`/funcionarios/${p.id}`} underline="hover" c="inherit">
                {nome}
              </Anchor>
            ) : (
              nome
            )}
            <Text size="xs" c="dimmed" truncate>
              {p.setor ?? 'sem setor'}
              {p.id === eu?.id ? ' · você' : ''}
            </Text>
          </div>
        </Group>
        {(p.ramal || p.email) && (
          <Stack gap={0} mt={6}>
            {p.ramal && (
              <Group gap={4} wrap="nowrap">
                <IconPhone size={12} />
                <Text size="xs">ramal {p.ramal}</Text>
              </Group>
            )}
            {p.email && (
              <Group gap={4} wrap="nowrap">
                <IconMail size={12} />
                <Text size="xs" truncate>
                  {p.email}
                </Text>
              </Group>
            )}
          </Stack>
        )}
        {sub > 0 && (
          <Group justify="space-between" mt={6} wrap="nowrap">
            <Text size="xs" c="dimmed">
              {sub} direto{sub === 1 ? '' : 's'} · {total.get(p.id)} no total
            </Text>
            <Tooltip label={fechados.has(p.id) ? 'Mostrar equipe' : 'Recolher equipe'}>
              <ActionIcon size="xs" variant="subtle" onClick={() => alternar(p.id)} aria-label={fechados.has(p.id) ? 'Mostrar equipe' : 'Recolher equipe'}>
                {fechados.has(p.id) ? <IconChevronDown size={14} /> : <IconChevronUp size={14} />}
              </ActionIcon>
            </Tooltip>
          </Group>
        )}
      </div>
    );
  };

  const no = (p: Pessoa, vistos: Set<number>): ReactNode => {
    if (vistos.has(p.id)) return null;
    const prox = new Set(vistos).add(p.id);
    const sub = filhos.get(p.id) ?? [];
    const aberto = sub.length > 0 && !fechados.has(p.id);
    // só folhas: empilha em coluna(s) em vez de espalhar na horizontal
    const soFolhas = sub.length > 2 && sub.every((c) => !filhos.has(c.id));
    return (
      <li key={p.id}>
        {cartao(p)}
        {aberto &&
          (soFolhas ? (
            <ul>
              <li>
                <div className={css.pilha} style={{ '--org-colunas': Math.ceil(sub.length / 8) } as CSSProperties}>
                  {sub.map((c) => (
                    <div key={c.id}>{cartao(c)}</div>
                  ))}
                </div>
              </li>
            </ul>
          ) : (
            <ul>{sub.map((c) => no(c, prox))}</ul>
          ))}
      </li>
    );
  };

  if (isLoading)
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );

  return (
    <Stack>
      <div>
        <Title order={3}>Organograma</Title>
        <Text size="sm" c="dimmed">
          Estrutura hierárquica da empresa, montada a partir do gerente de cada funcionário. Só aparecem funcionários ativos.
        </Text>
      </div>
      <Group>
        <Select
          placeholder="Ver a partir de…"
          searchable
          clearable
          w={320}
          value={foco}
          onChange={setFoco}
          nothingFoundMessage="Ninguém encontrado"
          data={data.map((p) => ({ value: String(p.id), label: p.setor ? `${p.nome} · ${p.setor}` : p.nome }))}
        />
        {eu && (
          <Button variant="light" leftSection={<IconCurrentLocation size={16} />} onClick={() => setFoco(String(eu.gerenteId && porId.has(eu.gerenteId) ? eu.gerenteId : eu.id))}>
            Onde estou
          </Button>
        )}
        <Button variant="default" onClick={() => setFechados(new Set())}>
          Expandir tudo
        </Button>
        <Button variant="default" onClick={() => setFechados(new Set(exibidos.flatMap((r) => (filhos.get(r.id) ?? []).filter((c) => filhos.has(c.id)).map((c) => c.id))))}>
          Só o 1º nível
        </Button>
        <Group gap="xs" w={200} wrap="nowrap">
          <IconZoomIn size={16} />
          <Slider style={{ flex: 1 }} min={40} max={120} step={10} value={zoom} onChange={setZoom} label={(v) => `${v}%`} />
        </Group>
      </Group>

      {trilha.length > 0 && (
        <Group gap={4}>
          <Text size="sm" c="dimmed">
            Acima:
          </Text>
          {trilha.map((t) => (
            <Badge key={t.id} variant="light" style={{ cursor: 'pointer' }} onClick={() => setFoco(String(t.id))} tt="none">
              {t.nome}
            </Badge>
          ))}
        </Group>
      )}

      <Card withBorder p={0}>
        <div className={css.area} ref={area}>
          {exibidos.length ? (
            <div style={{ zoom: zoom / 100, width: 'max-content', minWidth: '100%' }}>
              {exibidos.map((r) => (
                <ul key={r.id} className={css.arvore} style={{ marginBottom: 32 }}>
                  {no(r, new Set())}
                </ul>
              ))}
            </div>
          ) : (
            <Text size="sm" c="dimmed" ta="center" py="xl">
              Nenhuma hierarquia cadastrada ainda. Defina o gerente de cada funcionário na tela Funcionários.
            </Text>
          )}
        </div>
      </Card>

      {!focado && soltos.length > 0 && (
        <Card withBorder>
          <Text size="sm" fw={600} mb={4}>
            Sem posição no organograma ({soltos.length})
          </Text>
          <Text size="xs" c="dimmed" mb="sm">
            Funcionários sem gerente e sem equipe.
          </Text>
          <Group gap={6}>
            {soltos.map((p) => (
              <Badge key={p.id} variant="outline" color={corSetor(p.setor)} tt="none">
                {p.nome}
              </Badge>
            ))}
          </Group>
        </Card>
      )}
    </Stack>
  );
}
