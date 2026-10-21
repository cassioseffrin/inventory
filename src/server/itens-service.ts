import 'server-only';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db, type DbOrTx } from '@/db/inv';
import {
  camposCustomizados,
  funcionarios,
  grupos,
  gruposItens,
  itens,
  itensCamposValores,
  itensInterfaces,
} from '@/db/schema';
import type { ItemInput, ItemUpdate, ItensFiltro } from '@/lib/schemas';
import { whereItens } from './filtros-itens';
import { diff, registrar } from './historico';
import { HttpError, naoEncontrado, type Pagina } from './http';
import { obterHost } from './msf-repo';
import { igualCI, ipSemMascara, normalizarMac } from './util';

export type ItemRow = typeof itens.$inferSelect & { funcionarioNome: string | null; funcionarioMatricula: string | null };

const ORDENACAO = {
  numeroPatrimonio: itens.numeroPatrimonio,
  hostname: itens.hostname,
  ip: itens.ip,
  mac: itens.mac,
  osName: itens.osName,
  tipo: itens.tipo,
  status: itens.status,
  setor: itens.setor,
  localizacao: itens.localizacao,
  tag: itens.tag,
  funcionarioNome: funcionarios.nome,
  ultimoVistoMsf: itens.ultimoVistoMsf,
  updatedAt: itens.updatedAt,
  createdAt: itens.createdAt,
} as const;

const SELECAO = {
  item: itens,
  funcionarioNome: funcionarios.nome,
  funcionarioMatricula: funcionarios.matricula,
};

const achatar = (r: { item: typeof itens.$inferSelect; funcionarioNome: string | null; funcionarioMatricula: string | null }): ItemRow => ({
  ...r.item,
  ip: ipSemMascara(r.item.ip),
  funcionarioNome: r.funcionarioNome,
  funcionarioMatricula: r.funcionarioMatricula,
});

export async function listarItens(f: ItensFiltro): Promise<Pagina<ItemRow>> {
  const where = await whereItens(f);
  const col = ORDENACAO[(f.sort ?? 'numeroPatrimonio') as keyof typeof ORDENACAO] ?? itens.numeroPatrimonio;
  const ordem = f.dir === 'desc' ? sql`${col} DESC NULLS LAST` : sql`${col} ASC NULLS LAST`;

  const [rows, [{ total }]] = await Promise.all([
    db()
      .select(SELECAO)
      .from(itens)
      .leftJoin(funcionarios, eq(funcionarios.id, itens.funcionarioId))
      .where(where)
      .orderBy(ordem, asc(itens.id))
      .limit(f.pageSize)
      .offset((f.page - 1) * f.pageSize),
    db().select({ total: sql<number>`count(*)::int` }).from(itens).where(where),
  ]);
  return { dados: rows.map(achatar), total, page: f.page, pageSize: f.pageSize };
}

/** Todos os itens do filtro (para exportação CSV). */
export async function todosItens(f: Partial<ItensFiltro>): Promise<ItemRow[]> {
  const rows = await db()
    .select(SELECAO)
    .from(itens)
    .leftJoin(funcionarios, eq(funcionarios.id, itens.funcionarioId))
    .where(await whereItens(f))
    .orderBy(asc(itens.numeroPatrimonio));
  return rows.map(achatar);
}

export async function obterItem(id: number) {
  const [r] = await db()
    .select(SELECAO)
    .from(itens)
    .leftJoin(funcionarios, eq(funcionarios.id, itens.funcionarioId))
    .where(eq(itens.id, id));
  if (!r) throw naoEncontrado('Item');
  const [valores, gruposDoItem] = await Promise.all([
    db().select().from(itensCamposValores).where(eq(itensCamposValores.itemId, id)),
    db()
      .select({ id: grupos.id, nome: grupos.nome })
      .from(gruposItens)
      .innerJoin(grupos, eq(grupos.id, gruposItens.grupoId))
      .where(eq(gruposItens.itemId, id)),
  ]);
  return {
    ...achatar(r),
    camposCustomizados: Object.fromEntries(valores.map((v) => [String(v.campoId), v.valor])),
    gruposEstaticos: gruposDoItem,
  };
}

// ---------------------------------------------------------------- verificação de duplicidade

export type HostNoInventario = { id: number; numeroPatrimonio: string; criterio: 'mac' | 'ip+hostname' | 'msf_host_id' };

/** Verifica se um host (por MAC; sem MAC, por IP + hostname) já está no inventário. */
export async function hostJaInventariado(
  h: { mac?: string | null; ip?: string | null; hostname?: string | null; msfHostId?: number | null },
  ignorarId?: number,
  conn: DbOrTx = db(),
): Promise<HostNoInventario | null> {
  const mac = normalizarMac(h.mac);
  const ign = ignorarId ? sql`AND i.id <> ${ignorarId}` : sql``;
  if (mac) {
    const r = await conn.execute<{ id: number; numero_patrimonio: string }>(sql`
      SELECT i.id, i.numero_patrimonio FROM inventario.itens i
      WHERE (i.mac = ${mac} OR EXISTS (SELECT 1 FROM inventario.itens_interfaces f WHERE f.item_id = i.id AND f.mac = ${mac})) ${ign}
      LIMIT 1`);
    if (r.rows[0]) return { id: r.rows[0].id, numeroPatrimonio: r.rows[0].numero_patrimonio, criterio: 'mac' };
    return null;
  }
  if (h.ip) {
    const r = await conn.execute<{ id: number; numero_patrimonio: string; hostname: string | null }>(sql`
      SELECT i.id, i.numero_patrimonio, i.hostname FROM inventario.itens i
      WHERE host(i.ip) = ${ipSemMascara(h.ip)} ${ign}`);
    const it = r.rows.find((x) => igualCI(x.hostname, h.hostname));
    if (it) return { id: it.id, numeroPatrimonio: it.numero_patrimonio, criterio: 'ip+hostname' };
  }
  return null;
}

export async function patrimonioExiste(numero: string, ignorarId?: number) {
  const r = await db()
    .select({ id: itens.id })
    .from(itens)
    .where(and(sql`lower(${itens.numeroPatrimonio}) = lower(${numero})`, ignorarId ? sql`${itens.id} <> ${ignorarId}` : undefined));
  return r.length > 0;
}

/** MAC é único entre os itens: devolve o patrimônio do item que já o usa. */
export async function macEmUso(mac: string | null | undefined, ignorarId?: number) {
  if (!mac) return null;
  const [r] = await db()
    .select({ numeroPatrimonio: itens.numeroPatrimonio })
    .from(itens)
    .where(and(eq(itens.mac, mac), ignorarId ? sql`${itens.id} <> ${ignorarId}` : undefined));
  return r?.numeroPatrimonio ?? null;
}

const erroMacEmUso = (patrimonio: string) => new HttpError(409, `MAC já cadastrado no item ${patrimonio}`);

// ---------------------------------------------------------------- campos customizados

async function validarCustom(conn: DbOrTx, valores: Record<string, string | null> | undefined, parcial: boolean, itemId?: number) {
  const defs = await conn.select().from(camposCustomizados).where(eq(camposCustomizados.ativo, true));
  const erros: Record<string, string> = {};
  const limpos: { campoId: number; valor: string | null }[] = [];
  const existentes = new Map<number, string | null>();
  if (itemId) {
    const rows = await conn.select().from(itensCamposValores).where(eq(itensCamposValores.itemId, itemId));
    rows.forEach((r) => existentes.set(r.campoId, r.valor));
  }
  for (const d of defs) {
    const informado = valores && String(d.id) in valores;
    const bruto = informado ? valores![String(d.id)] : existentes.get(d.id) ?? null;
    const v = bruto === null || bruto === undefined || String(bruto).trim() === '' ? null : String(bruto).trim();
    if (d.obrigatorio && !v && (!parcial || informado)) erros[d.nome] = 'obrigatório';
    if (v && d.tipo === 'numero' && !Number.isFinite(Number(v.replace(',', '.')))) erros[d.nome] = 'precisa ser número';
    if (v && d.tipo === 'data' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) erros[d.nome] = 'data inválida (AAAA-MM-DD)';
    if (v && d.tipo === 'lista' && !(d.opcoes ?? []).includes(v)) erros[d.nome] = 'opção inválida';
    if (informado) limpos.push({ campoId: d.id, valor: v });
  }
  if (Object.keys(erros).length) throw new HttpError(400, 'Campos customizados inválidos', { campos: erros });
  return { defs, limpos, existentes };
}

async function gravarCustom(tx: DbOrTx, item: { id: number; numeroPatrimonio: string }, usuario: string, valores: Record<string, string | null> | undefined, parcial: boolean) {
  const { defs, limpos, existentes } = await validarCustom(tx, valores, parcial, item.id);
  const mudancas = [];
  for (const l of limpos) {
    const antigo = existentes.get(l.campoId) ?? null;
    if (antigo === l.valor) continue;
    await tx
      .insert(itensCamposValores)
      .values({ itemId: item.id, campoId: l.campoId, valor: l.valor })
      .onConflictDoUpdate({ target: [itensCamposValores.itemId, itensCamposValores.campoId], set: { valor: l.valor } });
    const def = defs.find((d) => d.id === l.campoId)!;
    mudancas.push({ campo: `custom:${def.nome}`, antigo, novo: l.valor });
  }
  return mudancas;
}

// ---------------------------------------------------------------- CRUD

const CAMPOS_ITEM = [
  'numeroPatrimonio', 'tag', 'ip', 'mac', 'hostname', 'osName', 'osFlavor', 'osSp', 'osFamily', 'arch', 'tipo', 'status',
  'funcionarioId', 'setor', 'localizacao', 'fabricante', 'modelo', 'numeroSerie', 'dataAquisicao', 'notaFiscal',
  'fornecedor', 'observacoes', 'msfHostId', 'msfWorkspaceId', 'msfWorkspaceNome',
] as const;

function paraColunas(input: Partial<ItemInput>) {
  const out: Record<string, unknown> = {};
  for (const k of CAMPOS_ITEM) if (k in input) out[k] = (input as Record<string, unknown>)[k] ?? null;
  if ('mac' in out) out.mac = normalizarMac(out.mac as string | null);
  return out as Partial<typeof itens.$inferInsert>;
}

async function garantirFuncionario(conn: DbOrTx, id: number | null | undefined) {
  if (!id) return;
  const [f] = await conn.select({ id: funcionarios.id }).from(funcionarios).where(eq(funcionarios.id, id));
  if (!f) throw new HttpError(400, 'Funcionário responsável não encontrado');
}

export async function criarItem(input: ItemInput & { confirmarDuplicado?: boolean }, usuario: string) {
  if (await patrimonioExiste(input.numeroPatrimonio)) throw new HttpError(409, 'Número de patrimônio já cadastrado');
  const donoMac = await macEmUso(normalizarMac(input.mac));
  if (donoMac) throw erroMacEmUso(donoMac);

  if (!input.confirmarDuplicado) {
    const dup = await hostJaInventariado(input);
    if (dup) {
      throw new HttpError(409, `Este host já está no inventário (patrimônio ${dup.numeroPatrimonio}, match por ${dup.criterio})`, {
        codigo: 'HOST_JA_INVENTARIADO',
        item: dup,
      });
    }
  }

  // Se veio do msf, buscamos o host de novo no servidor para o snapshot de "último visto" e do workspace.
  const host = input.msfHostId ? await obterHost(input.msfHostId) : null;

  return db().transaction(async (tx) => {
    await garantirFuncionario(tx, input.funcionarioId);
    const valores = paraColunas(input);
    const [novo] = await tx
      .insert(itens)
      .values({
        ...(valores as typeof itens.$inferInsert),
        msfWorkspaceId: host?.workspace_id ?? valores.msfWorkspaceId ?? null,
        msfWorkspaceNome: host?.workspace ?? valores.msfWorkspaceNome ?? null,
        ultimoVistoMsf: host?.updated_at ?? null,
        ultimaSincronizacao: host ? new Date() : null,
      })
      .returning();
    await gravarCustom(tx, novo, usuario, input.camposCustomizados, false);
    if (host) {
      await tx.insert(itensInterfaces).values({
        itemId: novo.id,
        nome: 'msf',
        ip: host.address,
        mac: normalizarMac(host.mac),
        origem: 'msf',
      });
    }
    await registrar(tx, novo, 'criacao', usuario, host ? [{ campo: 'origem', antigo: null, novo: `msf host #${host.id} (${host.address})` }] : []);
    return novo;
  });
}

export async function atualizarItem(id: number, patch: ItemUpdate, usuario: string) {
  return db().transaction(async (tx) => {
    const [atual] = await tx.select().from(itens).where(eq(itens.id, id)).for('update');
    if (!atual) throw naoEncontrado('Item');
    if (patch.numeroPatrimonio && patch.numeroPatrimonio !== atual.numeroPatrimonio && (await patrimonioExiste(patch.numeroPatrimonio, id))) {
      throw new HttpError(409, 'Número de patrimônio já cadastrado');
    }
    const novoMac = normalizarMac(patch.mac);
    if (novoMac && novoMac !== atual.mac) {
      const donoMac = await macEmUso(novoMac, id);
      if (donoMac) throw erroMacEmUso(donoMac);
    }
    if ('funcionarioId' in patch) await garantirFuncionario(tx, patch.funcionarioId);

    const cols = paraColunas(patch);
    const atualNorm = { ...atual, ip: ipSemMascara(atual.ip) } as Record<string, unknown>;
    const mudancas = diff(atualNorm, cols as Record<string, unknown>);
    if (atual.patrimonioProvisorio && cols.numeroPatrimonio && cols.numeroPatrimonio !== atual.numeroPatrimonio) {
      cols.patrimonioProvisorio = false; // recebeu o número definitivo
    }
    if (mudancas.length) {
      await tx.update(itens).set({ ...cols, updatedAt: new Date() }).where(eq(itens.id, id));
    }
    const ref = { id, numeroPatrimonio: (cols.numeroPatrimonio as string) ?? atual.numeroPatrimonio };
    const mudCustom = await gravarCustom(tx, ref, usuario, patch.camposCustomizados, true);
    if (mudCustom.length && !mudancas.length) await tx.update(itens).set({ updatedAt: new Date() }).where(eq(itens.id, id));
    const todas = [...mudancas, ...mudCustom];
    if (todas.length) await registrar(tx, ref, 'alteracao', usuario, todas);
    return { alterados: todas.length };
  });
}

export async function excluirItem(id: number, usuario: string) {
  await db().transaction(async (tx) => {
    const [atual] = await tx.select().from(itens).where(eq(itens.id, id));
    if (!atual) throw naoEncontrado('Item');
    await registrar(tx, atual, 'exclusao', usuario, [
      { campo: 'item', antigo: `${atual.numeroPatrimonio} ${atual.hostname ?? ''} ${ipSemMascara(atual.ip) ?? ''}`.trim(), novo: null },
    ]);
    await tx.delete(itens).where(eq(itens.id, id));
  });
}

export async function valoresDistintos() {
  const r = await db().execute<{ campo: string; valor: string }>(sql`
    SELECT 'setor' AS campo, setor AS valor FROM inventario.itens WHERE setor IS NOT NULL
    UNION SELECT 'setor', setor FROM inventario.funcionarios WHERE setor IS NOT NULL
    UNION SELECT 'tag', tag FROM inventario.itens WHERE tag IS NOT NULL
    UNION SELECT 'localizacao', localizacao FROM inventario.itens WHERE localizacao IS NOT NULL
    UNION SELECT 'fornecedor', fornecedor FROM inventario.itens WHERE fornecedor IS NOT NULL
    UNION SELECT 'fabricante', fabricante FROM inventario.itens WHERE fabricante IS NOT NULL
    ORDER BY 1, 2`);
  const out: Record<string, string[]> = { setor: [], tag: [], localizacao: [], fornecedor: [], fabricante: [] };
  r.rows.forEach((x) => out[x.campo]?.push(x.valor));
  return out;
}

