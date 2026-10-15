import 'server-only';
import { asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/inv';
import { softwareDicionario, softwareVariacoes } from '@/db/schema';
import type { DicionarioInput } from '@/lib/schemas';
import { naoEncontrado } from './http';

/**
 * Dicionário de software (conceito do OCS): variações de nome → nome canônico + categoria.
 * O padrão aceita `*` como curinga e é comparado sem diferenciar maiúsculas.
 * O nome canônico também casa por igualdade exata.
 */
const PADRAO_LIKE = sql.raw(`replace(replace(replace(lower(v.padrao), '_', '\\_'), '%', '\\%'), '*', '%')`);

/** Recalcula o vínculo itens_softwares → dicionário (todos os itens ou só um). */
export async function reclassificarSoftwares(itemId?: number) {
  await db().execute(sql`
    UPDATE inventario.itens_softwares s SET dicionario_id = COALESCE(
      (SELECT v.dicionario_id FROM inventario.software_variacoes v
        WHERE lower(s.nome) LIKE ${PADRAO_LIKE} ORDER BY length(v.padrao) DESC LIMIT 1),
      (SELECT d.id FROM inventario.software_dicionario d WHERE lower(d.nome_canonico) = lower(s.nome) LIMIT 1))
    ${itemId ? sql`WHERE s.item_id = ${itemId}` : sql``}`);
}

export async function listarDicionario() {
  const r = await db().execute(sql`
    SELECT d.id, d.nome_canonico AS "nomeCanonico", d.categoria, d.editor, d.observacao,
      COALESCE((SELECT json_agg(v.padrao ORDER BY v.padrao) FROM inventario.software_variacoes v WHERE v.dicionario_id = d.id), '[]') AS variacoes,
      (SELECT count(DISTINCT s.item_id)::int FROM inventario.itens_softwares s WHERE s.dicionario_id = d.id) AS instalacoes
    FROM inventario.software_dicionario d ORDER BY (d.categoria = 'proibido') DESC, d.nome_canonico`);
  return r.rows;
}

async function gravarVariacoes(id: number, variacoes: string[]) {
  await db().delete(softwareVariacoes).where(eq(softwareVariacoes.dicionarioId, id));
  const unicas = [...new Set(variacoes.map((v) => v.trim()).filter(Boolean))];
  if (unicas.length) {
    // um padrão pertence a um único nome canônico: move de onde estiver
    await db().execute(sql`DELETE FROM inventario.software_variacoes WHERE lower(padrao) = ANY(${sql.param(unicas.map((u) => u.toLowerCase()))}::text[])`);
    await db().insert(softwareVariacoes).values(unicas.map((padrao) => ({ dicionarioId: id, padrao })));
  }
}

export async function criarEntrada(d: DicionarioInput) {
  const [e] = await db()
    .insert(softwareDicionario)
    .values({ nomeCanonico: d.nomeCanonico, categoria: d.categoria, editor: d.editor, observacao: d.observacao })
    .returning();
  await gravarVariacoes(e.id, d.variacoes);
  await reclassificarSoftwares();
  return e;
}

export async function atualizarEntrada(id: number, d: DicionarioInput) {
  const [e] = await db()
    .update(softwareDicionario)
    .set({ nomeCanonico: d.nomeCanonico, categoria: d.categoria, editor: d.editor, observacao: d.observacao, updatedAt: new Date() })
    .where(eq(softwareDicionario.id, id))
    .returning();
  if (!e) throw naoEncontrado('Entrada do dicionário');
  await gravarVariacoes(id, d.variacoes);
  await reclassificarSoftwares();
  return e;
}

export async function excluirEntrada(id: number) {
  await db().delete(softwareDicionario).where(eq(softwareDicionario.id, id));
}

/** Agrupa nomes (exatos) sob um nome canônico existente. */
export async function agrupar(dicionarioId: number, nomes: string[]) {
  const [e] = await db().select().from(softwareDicionario).where(eq(softwareDicionario.id, dicionarioId));
  if (!e) throw naoEncontrado('Entrada do dicionário');
  const atuais = await db().select({ padrao: softwareVariacoes.padrao }).from(softwareVariacoes).where(eq(softwareVariacoes.dicionarioId, dicionarioId));
  await gravarVariacoes(dicionarioId, [...atuais.map((a) => a.padrao), ...nomes]);
  await reclassificarSoftwares();
}

/** Nomes de software instalados que ainda não casam com nenhuma entrada do dicionário. */
export async function naoClassificados(q?: string) {
  const like = q ? `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%` : null;
  const r = await db().execute(sql`
    SELECT s.nome, count(DISTINCT s.item_id)::int AS itens, min(s.editor) AS editor
    FROM inventario.itens_softwares s WHERE s.dicionario_id IS NULL
    ${like ? sql`AND s.nome ILIKE ${like}` : sql``}
    GROUP BY s.nome ORDER BY itens DESC, s.nome LIMIT 500`);
  return r.rows;
}

/** Relatório "onde está instalado": por entrada do dicionário ou por texto livre. */
export async function ondeInstalado(f: { dicionarioId?: number; nome?: string }) {
  const cond = f.dicionarioId
    ? sql`s.dicionario_id = ${f.dicionarioId}`
    : sql`(s.nome ILIKE ${`%${(f.nome ?? '').replace(/[\\%_]/g, (c) => '\\' + c)}%`})`;
  const r = await db().execute(sql`
    SELECT i.id AS "itemId", i.numero_patrimonio AS "numeroPatrimonio", i.hostname, host(i.ip) AS ip, i.setor,
           f.nome AS "funcionarioNome", s.nome AS software, s.versao, s.editor
    FROM inventario.itens_softwares s
    JOIN inventario.itens i ON i.id = s.item_id
    LEFT JOIN inventario.funcionarios f ON f.id = i.funcionario_id
    WHERE ${cond} ORDER BY i.numero_patrimonio, s.nome LIMIT 2000`);
  return r.rows;
}

/** Alertas: softwares de categoria "proibido" instalados. */
export async function alertasProibidos() {
  const r = await db().execute(sql`
    SELECT d.id AS "dicionarioId", d.nome_canonico AS "nomeCanonico", i.id AS "itemId", i.numero_patrimonio AS "numeroPatrimonio",
           i.hostname, host(i.ip) AS ip, f.nome AS "funcionarioNome", s.nome AS software, s.versao
    FROM inventario.itens_softwares s
    JOIN inventario.software_dicionario d ON d.id = s.dicionario_id AND d.categoria = 'proibido'
    JOIN inventario.itens i ON i.id = s.item_id
    LEFT JOIN inventario.funcionarios f ON f.id = i.funcionario_id
    ORDER BY d.nome_canonico, i.numero_patrimonio`);
  return r.rows;
}

export const listarEntradasSimples = () =>
  db().select({ id: softwareDicionario.id, nomeCanonico: softwareDicionario.nomeCanonico, categoria: softwareDicionario.categoria }).from(softwareDicionario).orderBy(asc(softwareDicionario.nomeCanonico));
