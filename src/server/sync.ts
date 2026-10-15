import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/inv';
import { itens, itensInterfaces } from '@/db/schema';
import { CAMPOS_SYNC, type CampoSync } from '@/lib/constants';
import { registrar, type Mudanca } from './historico';
import { HttpError, naoEncontrado } from './http';
import { hostsPorMacOuIp, obterHost, type MsfHost } from './msf-repo';
import { ipSemMascara, normalizarMac, texto } from './util';

type ItemSync = typeof itens.$inferSelect;
export type CriterioOrigem = 'msf_host_id' | 'mac' | 'ip';

/** Valor de cada campo sincronizável segundo o host do msf. */
export function valoresDoHost(h: MsfHost): Record<CampoSync, string | null> {
  return {
    ip: h.address,
    mac: normalizarMac(h.mac),
    hostname: h.name,
    osName: h.os_name,
    osFlavor: h.os_flavor,
    osSp: h.os_sp,
    osFamily: h.os_family,
    arch: h.arch,
  };
}

/**
 * Localiza o host de origem. O msf_host_id só é confiável se MAC/IP ainda batem
 * (após `msfdb reinit` os ids são reaproveitados). Depois tenta por MAC e, por fim, por IP.
 */
export async function encontrarHostDoItem(item: ItemSync): Promise<{ host: MsfHost; criterio: CriterioOrigem } | null> {
  const mac = normalizarMac(item.mac);
  const ip = ipSemMascara(item.ip);

  if (item.msfHostId) {
    const h = await obterHost(item.msfHostId);
    if (h) {
      const hmac = normalizarMac(h.mac);
      if ((mac && hmac === mac) || (!mac && ip && h.address === ip)) return { host: h, criterio: 'msf_host_id' };
    }
  }
  const candidatos = await hostsPorMacOuIp(mac ? [mac] : [], ip ? [ip] : []);
  const porMac = mac ? candidatos.find((h) => normalizarMac(h.mac) === mac) : undefined;
  if (porMac) return { host: porMac, criterio: 'mac' };
  // por IP só se não houver conflito de MAC (outro equipamento assumiu o IP)
  const porIp = candidatos.find((h) => h.address === ip && (!mac || !normalizarMac(h.mac)));
  if (porIp) return { host: porIp, criterio: 'ip' };
  return null;
}

export async function previewSync(itemId: number) {
  const [item] = await db().select().from(itens).where(eq(itens.id, itemId));
  if (!item) throw naoEncontrado('Item');
  const origem = await encontrarHostDoItem(item);
  if (!origem) return { encontrado: false as const, diffs: [] };

  const doHost = valoresDoHost(origem.host);
  const atual = { ...item, ip: ipSemMascara(item.ip) } as Record<string, unknown>;
  // campos vazios no msf nunca apagam dados do inventário
  const diffs = CAMPOS_SYNC.filter((c) => doHost[c] !== null && texto(atual[c]) !== texto(doHost[c])).map((c) => ({
    campo: c,
    atual: texto(atual[c]),
    msf: doHost[c],
  }));
  return {
    encontrado: true as const,
    criterio: origem.criterio,
    host: {
      id: origem.host.id,
      address: origem.host.address,
      mac: origem.host.mac,
      name: origem.host.name,
      workspace: origem.host.workspace,
      updatedAt: origem.host.updated_at,
    },
    diffs,
  };
}

/** Aplica os campos escolhidos. Nunca toca em campos administrativos/manuais. */
export async function aplicarSync(itemId: number, campos: CampoSync[], usuario: string) {
  const [item] = await db().select().from(itens).where(eq(itens.id, itemId));
  if (!item) throw naoEncontrado('Item');
  const origem = await encontrarHostDoItem(item);
  if (!origem) throw new HttpError(404, 'Host de origem não encontrado no msf');
  return aplicarHostNoItem(item, origem.host, campos, usuario, 'sincronizacao');
}

export async function aplicarHostNoItem(
  item: ItemSync,
  host: MsfHost,
  campos: readonly CampoSync[],
  usuario: string,
  acao: 'sincronizacao' | 'importacao',
) {
  const doHost = valoresDoHost(host);
  const atual = { ...item, ip: ipSemMascara(item.ip) } as Record<string, unknown>;
  const set: Record<string, unknown> = {};
  const mudancas: Mudanca[] = [];
  for (const c of campos) {
    if (!CAMPOS_SYNC.includes(c) || doHost[c] === null) continue;
    if (texto(atual[c]) !== texto(doHost[c])) {
      set[c] = doHost[c];
      mudancas.push({ campo: c, antigo: atual[c], novo: doHost[c] });
    }
  }
  await db().transaction(async (tx) => {
    await tx
      .update(itens)
      .set({
        ...set,
        msfHostId: host.id,
        msfWorkspaceId: host.workspace_id,
        msfWorkspaceNome: host.workspace,
        ultimaSincronizacao: new Date(),
        ultimoVistoMsf: host.updated_at,
        updatedAt: mudancas.length ? new Date() : item.updatedAt,
      })
      .where(eq(itens.id, item.id));
    // mantém uma interface "msf" espelhando o host de origem
    const mac = normalizarMac(host.mac);
    const upd = await tx
      .update(itensInterfaces)
      .set({ ip: host.address, mac })
      .where(and(eq(itensInterfaces.itemId, item.id), eq(itensInterfaces.origem, 'msf')))
      .returning({ id: itensInterfaces.id });
    if (!upd.length) await tx.insert(itensInterfaces).values({ itemId: item.id, nome: 'msf', ip: host.address, mac, origem: 'msf' });
    if (mudancas.length) await registrar(tx, item, acao, usuario, mudancas);
  });
  return { aplicados: mudancas.map((m) => m.campo) };
}

/**
 * Atualiza apenas `ultimo_visto_msf` de todos os itens (match por MAC, depois IP). Não altera dados.
 * Útil depois de cada rodada de scan, para o relatório "não visto há N dias".
 */
export async function atualizarUltimoVisto() {
  const todos = await db()
    .select({ id: itens.id, mac: itens.mac, ip: sql<string | null>`host(${itens.ip})` })
    .from(itens);
  const macs = [...new Set(todos.map((i) => normalizarMac(i.mac)).filter((m): m is string => !!m))];
  const ips = [...new Set(todos.map((i) => i.ip).filter((m): m is string => !!m))];
  const hosts = await hostsPorMacOuIp(macs, ips);

  const vistoMac = new Map<string, Date>();
  const vistoIp = new Map<string, Date>();
  const maior = (m: Map<string, Date>, k: string | null, d: Date | null) => {
    if (!k || !d) return;
    const a = m.get(k);
    if (!a || a < d) m.set(k, d);
  };
  for (const h of hosts) {
    maior(vistoMac, normalizarMac(h.mac), h.updated_at);
    if (!normalizarMac(h.mac)) maior(vistoIp, h.address, h.updated_at);
  }

  const ids: number[] = [];
  const vistos: string[] = [];
  for (const i of todos) {
    const mac = normalizarMac(i.mac);
    const d = mac ? vistoMac.get(mac) : i.ip ? vistoIp.get(i.ip) : undefined;
    if (d) {
      ids.push(i.id);
      vistos.push(d.toISOString());
    }
  }
  if (ids.length) {
    await db().execute(sql`
      UPDATE inventario.itens i SET ultimo_visto_msf = v.visto
      FROM unnest(${sql.param(ids)}::int[], ${sql.param(vistos)}::timestamptz[]) AS v(id, visto)
      WHERE i.id = v.id AND (i.ultimo_visto_msf IS NULL OR i.ultimo_visto_msf < v.visto)`);
  }
  return { itens: todos.length, encontrados: ids.length };
}
