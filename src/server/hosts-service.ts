import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/db/inv';
import { dispositivosIdentificados } from '@/db/schema';
import type { HostSituacao } from '@/lib/constants';
import { env } from './env';
import { condicaoGrupo } from './filtros-itens';
import { HttpError, type Pagina } from './http';
import { criarClassificador, type Classificacao } from './match';
import { listarHosts, type MsfHost } from './msf-repo';
import { ipNaSubrede, ipSemMascara, normalizarMac, subredeDe } from './util';

export type HostClassificado = MsfHost & Classificacao & { subrede: string };

export type FiltroHosts = {
  workspaceId?: number;
  q?: string;
  sort?: string;
  dir?: 'asc' | 'desc';
  situacao?: HostSituacao[];
  subrede?: string;
  grupoId?: number;
  page: number;
  pageSize: number;
};

/** Hosts do msf + classificação contra o inventário, já filtrados (sem paginar). */
export async function hostsClassificados(f: Omit<FiltroHosts, 'page' | 'pageSize'>): Promise<HostClassificado[]> {
  const [hosts, classificar] = await Promise.all([listarHosts(f), criarClassificador()]);
  const prefixo = env().SUBNET_PREFIX;

  let idsGrupo: Set<number> | undefined;
  if (f.grupoId) {
    const cond = await condicaoGrupo(f.grupoId);
    const r = await db().execute<{ id: number }>(sql`SELECT itens.id FROM inventario.itens WHERE ${cond}`);
    idsGrupo = new Set(r.rows.map((x) => x.id));
  }

  return hosts
    .map((h) => ({ ...h, ...classificar(h), subrede: subredeDe(h.address, prefixo) }))
    .filter((h) => !f.situacao?.length || f.situacao.includes(h.situacao))
    .filter((h) => !f.subrede || (f.subrede.includes('/') ? ipNaSubrede(h.address, f.subrede) : h.subrede === f.subrede))
    .filter((h) => !idsGrupo || (h.itemId !== undefined && idsGrupo.has(h.itemId)));
}

/**
 * Listagem paginada. A classificação depende de dois bancos distintos, então a filtragem por situação
 * acontece na aplicação: a consulta ao msf traz só colunas leves, e isso escala bem até dezenas de milhares de hosts.
 */
export async function listarHostsClassificados(f: FiltroHosts): Promise<Pagina<HostClassificado> & { resumo: Record<HostSituacao, number> }> {
  const todos = await hostsClassificados({ ...f, situacao: undefined });
  const resumo: Record<HostSituacao, number> = { inventariado: 0, provavel: 0, conhecido: 0, ignorado: 0, desconhecido: 0 };
  todos.forEach((h) => resumo[h.situacao]++);
  const filtrados = f.situacao?.length ? todos.filter((h) => f.situacao!.includes(h.situacao)) : todos;
  const ini = (f.page - 1) * f.pageSize;
  return { dados: filtrados.slice(ini, ini + f.pageSize), total: filtrados.length, page: f.page, pageSize: f.pageSize, resumo };
}

/** Painel IPDiscover: por sub-rede, total visto / inventariado / identificado / desconhecido. */
export async function painelSubredes(workspaceId?: number) {
  const hosts = await hostsClassificados({ workspaceId });
  const m = new Map<string, { subrede: string; total: number; inventariados: number; provaveis: number; identificados: number; ignorados: number; desconhecidos: number; ultimoVisto: Date | null }>();
  for (const h of hosts) {
    const s = m.get(h.subrede) ?? { subrede: h.subrede, total: 0, inventariados: 0, provaveis: 0, identificados: 0, ignorados: 0, desconhecidos: 0, ultimoVisto: null };
    s.total++;
    if (h.situacao === 'inventariado') s.inventariados++;
    else if (h.situacao === 'provavel') s.provaveis++;
    else if (h.situacao === 'conhecido') s.identificados++;
    else if (h.situacao === 'ignorado') s.ignorados++;
    else s.desconhecidos++;
    if (h.updated_at && (!s.ultimoVisto || s.ultimoVisto < h.updated_at)) s.ultimoVisto = h.updated_at;
    m.set(h.subrede, s);
  }
  return [...m.values()].sort((a, b) => a.subrede.localeCompare(b.subrede, undefined, { numeric: true }));
}

/** Classifica um host desconhecido como dispositivo conhecido ou ignorado (persistido por MAC; sem MAC, por IP). */
export async function classificarDispositivo(
  d: { mac?: string | null; ip?: string | null; classificacao: 'conhecido' | 'ignorado'; tipo?: string | null; descricao?: string | null },
  usuario: string,
) {
  const mac = normalizarMac(d.mac);
  const ip = ipSemMascara(d.ip);
  if (!mac && !ip) throw new HttpError(400, 'Informe MAC ou IP');
  const valores = { mac, ip: mac ? ip : ip, classificacao: d.classificacao, tipo: d.tipo ?? null, descricao: d.descricao ?? null, usuario, updatedAt: new Date() };
  if (mac) {
    await db()
      .insert(dispositivosIdentificados)
      .values(valores)
      .onConflictDoUpdate({ target: dispositivosIdentificados.mac, targetWhere: sql`mac IS NOT NULL`, set: valores });
  } else {
    await db()
      .insert(dispositivosIdentificados)
      .values(valores)
      .onConflictDoUpdate({ target: dispositivosIdentificados.ip, targetWhere: sql`mac IS NULL`, set: valores });
  }
}

export async function removerClassificacao(id: number) {
  await db().execute(sql`DELETE FROM inventario.dispositivos_identificados WHERE id = ${id}`);
}

export async function listarDispositivos() {
  const r = await db().execute(sql`
    SELECT id, mac, host(ip) AS ip, classificacao, tipo, descricao, usuario, updated_at AS "updatedAt"
    FROM inventario.dispositivos_identificados ORDER BY classificacao, updated_at DESC`);
  return r.rows;
}
