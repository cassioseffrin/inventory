import 'server-only';
import { asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/inv';
import { grupos, gruposItens, itens, itensCamposValores, itensHardware, itensHistorico } from '@/db/schema';
import type { GrupoInput } from '@/lib/schemas';
import { compilarCriterios } from './filtros-itens';
import { criteriosSchema } from '@/lib/schemas';
import { registrar } from './historico';
import { HttpError, naoEncontrado } from './http';
import { ipSemMascara, texto } from './util';

// ---------------------------------------------------------------- grupos

export async function listarGrupos() {
  const lista = await db().select().from(grupos).orderBy(asc(grupos.nome));
  // dinâmicos são recalculados ao listar/abrir
  return Promise.all(
    lista.map(async (g) => {
      const cond =
        g.tipo === 'estatico'
          ? sql`EXISTS (SELECT 1 FROM inventario.grupos_itens gi WHERE gi.grupo_id = ${g.id} AND gi.item_id = ${itens.id})`
          : compilarCriterios(criteriosSchema.parse(g.criterios));
      const [{ total }] = await db().select({ total: sql<number>`count(*)::int` }).from(itens).where(cond);
      return { ...g, total };
    }),
  );
}

export async function obterGrupo(id: number) {
  const [g] = await db().select().from(grupos).where(eq(grupos.id, id));
  if (!g) throw naoEncontrado('Grupo');
  return g;
}

export async function criarGrupo(d: GrupoInput) {
  const [g] = await db()
    .insert(grupos)
    .values({ nome: d.nome, descricao: d.descricao, tipo: d.tipo, criterios: d.tipo === 'dinamico' ? d.criterios : null })
    .returning();
  return g;
}

export async function atualizarGrupo(id: number, d: GrupoInput) {
  const atual = await obterGrupo(id);
  if (atual.tipo !== d.tipo) throw new HttpError(400, 'Não é possível trocar o tipo do grupo');
  const [g] = await db()
    .update(grupos)
    .set({ nome: d.nome, descricao: d.descricao, criterios: d.tipo === 'dinamico' ? d.criterios : null, updatedAt: new Date() })
    .where(eq(grupos.id, id))
    .returning();
  return g;
}

export async function excluirGrupo(id: number) {
  await db().delete(grupos).where(eq(grupos.id, id));
}

export async function adicionarAoGrupo(grupoId: number, itemIds: number[]) {
  const g = await obterGrupo(grupoId);
  if (g.tipo !== 'estatico') throw new HttpError(400, 'Só grupos estáticos aceitam itens manualmente');
  if (itemIds.length) await db().insert(gruposItens).values(itemIds.map((itemId) => ({ grupoId, itemId }))).onConflictDoNothing();
}

export async function removerDoGrupo(grupoId: number, itemIds: number[]) {
  await db().execute(sql`DELETE FROM inventario.grupos_itens WHERE grupo_id = ${grupoId} AND item_id = ANY(${sql.param(itemIds)}::int[])`);
}

/** Pré-visualiza quantos/quais itens um conjunto de critérios seleciona (antes de salvar o grupo). */
export async function previewCriterios(criterios: unknown) {
  const c = criteriosSchema.parse(criterios);
  const cond = compilarCriterios(c);
  const [{ total }] = await db().select({ total: sql<number>`count(*)::int` }).from(itens).where(cond);
  const amostra = await db()
    .select({ id: itens.id, numeroPatrimonio: itens.numeroPatrimonio, hostname: itens.hostname, osName: itens.osName })
    .from(itens)
    .where(cond)
    .limit(10);
  return { total, amostra };
}

// ---------------------------------------------------------------- duplicados

export const CRITERIOS_DUP = {
  mac: sql`i.mac`,
  numeroSerie: sql`lower(nullif(trim(i.numero_serie), ''))`,
  hostname: sql`lower(nullif(trim(i.hostname), ''))`,
  ip: sql`host(i.ip)`,
} as const;
export type CriterioDup = keyof typeof CRITERIOS_DUP;

export async function listarDuplicados(criterios: CriterioDup[]) {
  const out: { criterio: CriterioDup; valor: string; itens: { id: number; numeroPatrimonio: string; hostname: string | null; ip: string | null; mac: string | null; numeroSerie: string | null; status: string; updatedAt: string }[] }[] = [];
  for (const c of criterios) {
    const r = await db().execute<{ valor: string; itens: (typeof out)[number]['itens'] }>(sql`
      SELECT ${CRITERIOS_DUP[c]} AS valor,
        json_agg(json_build_object('id', i.id, 'numeroPatrimonio', i.numero_patrimonio, 'hostname', i.hostname,
          'ip', host(i.ip), 'mac', i.mac, 'numeroSerie', i.numero_serie, 'status', i.status, 'updatedAt', i.updated_at) ORDER BY i.id) AS itens
      FROM inventario.itens i
      WHERE ${CRITERIOS_DUP[c]} IS NOT NULL
      GROUP BY 1 HAVING count(*) > 1 ORDER BY 1`);
    r.rows.forEach((row) => out.push({ criterio: c, valor: row.valor, itens: row.itens }));
  }
  return out;
}

export async function contarDuplicados() {
  const r = await db().execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM (
      SELECT 'mac', mac FROM inventario.itens WHERE mac IS NOT NULL GROUP BY mac HAVING count(*) > 1
      UNION ALL SELECT 'serie', lower(numero_serie) FROM inventario.itens WHERE nullif(trim(numero_serie), '') IS NOT NULL GROUP BY 2 HAVING count(*) > 1
      UNION ALL SELECT 'host', lower(hostname) FROM inventario.itens WHERE nullif(trim(hostname), '') IS NOT NULL GROUP BY 2 HAVING count(*) > 1
      UNION ALL SELECT 'ip', host(ip) FROM inventario.itens WHERE ip IS NOT NULL GROUP BY 2 HAVING count(*) > 1
    ) x`);
  return r.rows[0].n;
}

export const CAMPOS_MESCLA = [
  'numeroPatrimonio', 'tag', 'ip', 'mac', 'hostname', 'osName', 'osFlavor', 'osSp', 'osFamily', 'arch', 'tipo', 'status',
  'funcionarioId', 'setor', 'localizacao', 'fabricante', 'modelo', 'numeroSerie', 'dataAquisicao', 'notaFiscal', 'fornecedor',
  'observacoes', 'descricao', 'msfHostId', 'msfWorkspaceId', 'msfWorkspaceNome', 'ultimoVistoMsf', 'ultimaSincronizacao',
] as const;

/**
 * Mescla `removerId` em `manterId`. `escolhas[campo] = 'remover'` usa o valor do item removido; o padrão é manter.
 * Seções 1:N (interfaces, discos, softwares), grupos, campos customizados e histórico são transferidos.
 */
export async function mesclar(manterId: number, removerId: number, escolhas: Record<string, 'manter' | 'remover'>, usuario: string) {
  if (manterId === removerId) throw new HttpError(400, 'Selecione itens diferentes');
  return db().transaction(async (tx) => {
    const [a] = await tx.select().from(itens).where(eq(itens.id, manterId)).for('update');
    const [b] = await tx.select().from(itens).where(eq(itens.id, removerId)).for('update');
    if (!a || !b) throw naoEncontrado('Item');

    const set: Record<string, unknown> = {};
    const mudancas = [];
    for (const campo of CAMPOS_MESCLA) {
      if (escolhas[campo] !== 'remover') continue;
      const va = campo === 'ip' ? ipSemMascara(a.ip) : (a as Record<string, unknown>)[campo];
      const vb = campo === 'ip' ? ipSemMascara(b.ip) : (b as Record<string, unknown>)[campo];
      if (texto(va) !== texto(vb)) {
        set[campo] = vb;
        mudancas.push({ campo, antigo: va, novo: vb });
      }
    }
    if (escolhas.numeroPatrimonio === 'remover') set.patrimonioProvisorio = b.patrimonioProvisorio;

    // filhos
    await tx.execute(sql`UPDATE inventario.itens_interfaces SET item_id = ${manterId} WHERE item_id = ${removerId}`);
    await tx.execute(sql`UPDATE inventario.itens_discos SET item_id = ${manterId} WHERE item_id = ${removerId}`);
    await tx.execute(sql`
      UPDATE inventario.itens_softwares s SET item_id = ${manterId} WHERE s.item_id = ${removerId}
      AND NOT EXISTS (SELECT 1 FROM inventario.itens_softwares x WHERE x.item_id = ${manterId}
                      AND lower(x.nome) = lower(s.nome) AND coalesce(x.versao,'') = coalesce(s.versao,''))`);
    await tx.execute(sql`
      INSERT INTO inventario.grupos_itens (grupo_id, item_id) SELECT grupo_id, ${manterId} FROM inventario.grupos_itens
      WHERE item_id = ${removerId} ON CONFLICT DO NOTHING`);
    await tx.execute(sql`
      INSERT INTO inventario.itens_campos_valores (item_id, campo_id, valor) SELECT ${manterId}, campo_id, valor
      FROM inventario.itens_campos_valores WHERE item_id = ${removerId} ON CONFLICT DO NOTHING`);
    const [hwA] = await tx.select({ id: itensHardware.itemId }).from(itensHardware).where(eq(itensHardware.itemId, manterId));
    if (!hwA) await tx.update(itensHardware).set({ itemId: manterId }).where(eq(itensHardware.itemId, removerId));
    await tx.update(itensHistorico).set({ itemId: manterId }).where(eq(itensHistorico.itemId, removerId));

    await tx.delete(itensCamposValores).where(eq(itensCamposValores.itemId, removerId));
    await tx.delete(itens).where(eq(itens.id, removerId)); // libera o nº de patrimônio antes de reutilizá-lo
    if (Object.keys(set).length) await tx.update(itens).set({ ...set, updatedAt: new Date() }).where(eq(itens.id, manterId));

    const ref = { id: manterId, numeroPatrimonio: (set.numeroPatrimonio as string) ?? a.numeroPatrimonio };
    await registrar(tx, ref, 'mesclagem', usuario, [
      { campo: 'mesclado', antigo: `${b.numeroPatrimonio} (#${b.id})`, novo: `${ref.numeroPatrimonio} (#${manterId})` },
      ...mudancas,
    ]);
    return { id: manterId, alterados: mudancas.map((m) => m.campo) };
  });
}
