import 'server-only';
import { and, asc, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/inv';
import {
  camposCustomizados,
  funcionarios,
  itens,
  itensCamposValores,
  itensDiscos,
  itensHardware,
  itensInterfaces,
  itensSoftwares,
} from '@/db/schema';
import type { CampoCustomInput, FuncionarioInput } from '@/lib/schemas';
import { registrar } from './historico';
import { naoEncontrado, type Pagina } from './http';
import { reclassificarSoftwares } from './dicionario-service';
import { ipSemMascara, normalizarMac } from './util';

// ---------------------------------------------------------------- funcionários

export async function listarFuncionarios(f: { q?: string; ativo?: boolean; setor?: string; page: number; pageSize: number }): Promise<Pagina<typeof funcionarios.$inferSelect & { itens: number }>> {
  const like = f.q ? `%${f.q.replace(/[\\%_]/g, (c) => '\\' + c)}%` : null;
  const where = and(
    like ? sql`(${funcionarios.nome} ILIKE ${like} OR ${funcionarios.matricula} ILIKE ${like} OR ${funcionarios.email} ILIKE ${like})` : undefined,
    f.ativo === undefined ? undefined : eq(funcionarios.ativo, f.ativo),
    f.setor ? sql`lower(${funcionarios.setor}) = lower(${f.setor})` : undefined,
  );
  const [dados, [{ total }]] = await Promise.all([
    db()
      .select({
        ...getTableColumns(funcionarios),
        itens: sql<number>`(SELECT count(*)::int FROM inventario.itens i WHERE i.funcionario_id = ${funcionarios.id})`,
      })
      .from(funcionarios)
      .where(where)
      .orderBy(asc(funcionarios.nome))
      .limit(f.pageSize)
      .offset((f.page - 1) * f.pageSize),
    db().select({ total: sql<number>`count(*)::int` }).from(funcionarios).where(where),
  ]);
  return { dados, total, page: f.page, pageSize: f.pageSize };
}

/** Lista curta para o select com busca. */
export async function opcoesFuncionarios(q?: string) {
  const like = q ? `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%` : null;
  return db()
    .select({ id: funcionarios.id, nome: funcionarios.nome, matricula: funcionarios.matricula, setor: funcionarios.setor, ativo: funcionarios.ativo })
    .from(funcionarios)
    .where(like ? sql`(${funcionarios.nome} ILIKE ${like} OR ${funcionarios.matricula} ILIKE ${like})` : undefined)
    .orderBy(asc(funcionarios.nome))
    .limit(50);
}

export async function obterFuncionario(id: number) {
  const [f] = await db().select().from(funcionarios).where(eq(funcionarios.id, id));
  if (!f) throw naoEncontrado('Funcionário');
  const seusItens = await db()
    .select({
      id: itens.id,
      numeroPatrimonio: itens.numeroPatrimonio,
      hostname: itens.hostname,
      ip: sql<string | null>`host(${itens.ip})`,
      tipo: itens.tipo,
      status: itens.status,
      osName: itens.osName,
      localizacao: itens.localizacao,
    })
    .from(itens)
    .where(eq(itens.funcionarioId, id))
    .orderBy(asc(itens.numeroPatrimonio));
  return { ...f, itens: seusItens };
}

/**
 * Associa (`adicionar`) ou desassocia (`remover`) itens do funcionário em lote.
 * Itens de outro responsável são transferidos; tudo vira `troca_responsavel` no histórico.
 */
export async function associarItensFuncionario(id: number, d: { adicionar: number[]; remover: number[] }, usuario: string) {
  return db().transaction(async (tx) => {
    const [f] = await tx.select({ id: funcionarios.id }).from(funcionarios).where(eq(funcionarios.id, id));
    if (!f) throw naoEncontrado('Funcionário');
    const ids = [...new Set([...d.adicionar, ...d.remover])];
    if (!ids.length) return { alterados: 0 };
    const atuais = await tx
      .select({ id: itens.id, numeroPatrimonio: itens.numeroPatrimonio, funcionarioId: itens.funcionarioId })
      .from(itens)
      .where(inArray(itens.id, ids))
      .for('update');
    const adicionar = new Set(d.adicionar);
    let alterados = 0;
    for (const it of atuais) {
      // só desassocia o que ainda é deste funcionário
      const novo = adicionar.has(it.id) ? id : it.funcionarioId === id ? null : it.funcionarioId;
      if (novo === it.funcionarioId) continue;
      await tx.update(itens).set({ funcionarioId: novo, updatedAt: new Date() }).where(eq(itens.id, it.id));
      await registrar(tx, it, 'alteracao', usuario, [{ campo: 'funcionarioId', antigo: it.funcionarioId, novo }]);
      alterados++;
    }
    return { alterados };
  });
}

export async function criarFuncionario(d: FuncionarioInput) {
  const [f] = await db().insert(funcionarios).values(d).returning();
  return f;
}

export async function atualizarFuncionario(id: number, d: Partial<FuncionarioInput>) {
  const [f] = await db().update(funcionarios).set({ ...d, updatedAt: new Date() }).where(eq(funcionarios.id, id)).returning();
  if (!f) throw naoEncontrado('Funcionário');
  return f;
}

export async function excluirFuncionario(id: number) {
  // itens vinculados ficam sem responsável (FK ON DELETE SET NULL); preferir inativar
  const r = await db().delete(funcionarios).where(eq(funcionarios.id, id)).returning({ id: funcionarios.id });
  if (!r.length) throw naoEncontrado('Funcionário');
}

// ---------------------------------------------------------------- campos customizados

/** `emUso`: quantos itens têm valor preenchido no campo (perdidos se o campo for excluído). */
export const listarCampos = (somenteAtivos = false) =>
  db()
    .select({
      ...getTableColumns(camposCustomizados),
      emUso: sql<number>`(SELECT count(*)::int FROM ${itensCamposValores} v WHERE v.campo_id = ${camposCustomizados.id} AND coalesce(v.valor, '') <> '')`,
    })
    .from(camposCustomizados)
    .where(somenteAtivos ? eq(camposCustomizados.ativo, true) : undefined)
    .orderBy(asc(camposCustomizados.ordem), asc(camposCustomizados.nome));

export async function criarCampo(d: CampoCustomInput) {
  const [c] = await db().insert(camposCustomizados).values({ ...d, opcoes: d.tipo === 'lista' ? d.opcoes : null }).returning();
  return c;
}

export async function atualizarCampo(id: number, d: CampoCustomInput) {
  const [c] = await db()
    .update(camposCustomizados)
    .set({ ...d, opcoes: d.tipo === 'lista' ? d.opcoes : null, updatedAt: new Date() })
    .where(eq(camposCustomizados.id, id))
    .returning();
  if (!c) throw naoEncontrado('Campo');
  return c;
}

export async function excluirCampo(id: number) {
  await db().delete(camposCustomizados).where(eq(camposCustomizados.id, id));
}

// ---------------------------------------------------------------- seções do item (hardware / discos / interfaces / softwares)

async function itemRef(id: number) {
  const [i] = await db().select({ id: itens.id, numeroPatrimonio: itens.numeroPatrimonio }).from(itens).where(eq(itens.id, id));
  if (!i) throw naoEncontrado('Item');
  return i;
}

export async function obterSecoes(itemId: number) {
  await itemRef(itemId);
  const [hardware, discos, interfaces] = await Promise.all([
    db().select().from(itensHardware).where(eq(itensHardware.itemId, itemId)),
    db().select().from(itensDiscos).where(eq(itensDiscos.itemId, itemId)).orderBy(asc(itensDiscos.id)),
    db().select().from(itensInterfaces).where(eq(itensInterfaces.itemId, itemId)).orderBy(asc(itensInterfaces.id)),
  ]);
  return {
    hardware: hardware[0] ?? null,
    discos,
    interfaces: interfaces.map((i) => ({ ...i, ip: ipSemMascara(i.ip), gateway: ipSemMascara(i.gateway) })),
  };
}

export async function salvarHardware(itemId: number, d: Partial<typeof itensHardware.$inferInsert>, usuario: string) {
  const ref = await itemRef(itemId);
  const valores = { ...d, itemId, origem: 'manual' as const, updatedAt: new Date() };
  await db().insert(itensHardware).values(valores).onConflictDoUpdate({ target: itensHardware.itemId, set: valores });
  await registrar(db(), ref, 'alteracao', usuario, [{ campo: 'hardware', antigo: null, novo: 'dados de hardware atualizados' }]);
}

type Secao = 'discos' | 'interfaces';
const TABELA = { discos: itensDiscos, interfaces: itensInterfaces } as const;

export async function adicionarLinha(secao: Secao, itemId: number, d: Record<string, unknown>, usuario: string) {
  const ref = await itemRef(itemId);
  const valores = secao === 'interfaces' ? { ...d, mac: normalizarMac(d.mac as string) } : { ...d, tamanhoGb: d.tamanhoGb == null ? null : String(d.tamanhoGb) };
  const [r] = await db()
    .insert(TABELA[secao])
    .values({ ...valores, itemId, origem: 'manual' } as never)
    .returning();
  await registrar(db(), ref, 'alteracao', usuario, [{ campo: secao, antigo: null, novo: 'linha adicionada' }]);
  return r;
}

export async function atualizarLinha(secao: Secao, itemId: number, linhaId: number, d: Record<string, unknown>) {
  const t = TABELA[secao];
  const valores = secao === 'interfaces' ? { ...d, mac: normalizarMac(d.mac as string) } : { ...d, tamanhoGb: d.tamanhoGb == null ? null : String(d.tamanhoGb) };
  const r = await db().update(t).set(valores as never).where(and(eq(t.id, linhaId), eq(t.itemId, itemId))).returning();
  if (!r.length) throw naoEncontrado('Registro');
  return r[0];
}

export async function removerLinha(secao: Secao | 'softwares', itemId: number, linhaId: number) {
  const t = secao === 'softwares' ? itensSoftwares : TABELA[secao];
  await db().delete(t).where(and(eq(t.id, linhaId), eq(t.itemId, itemId)));
}

export async function listarSoftwaresDoItem(itemId: number) {
  const r = await db().execute(sql`
    SELECT s.id, s.nome, s.versao, s.editor, s.data_instalacao AS "dataInstalacao", s.origem,
           d.id AS "dicionarioId", d.nome_canonico AS "nomeCanonico", d.categoria
    FROM inventario.itens_softwares s
    LEFT JOIN inventario.software_dicionario d ON d.id = s.dicionario_id
    WHERE s.item_id = ${itemId}
    ORDER BY (d.categoria = 'proibido') DESC NULLS LAST, lower(s.nome)`);
  return r.rows;
}

export async function adicionarSoftware(itemId: number, d: { nome: string; versao?: string | null; editor?: string | null; dataInstalacao?: string | null }, usuario: string) {
  const ref = await itemRef(itemId);
  await db().insert(itensSoftwares).values({ ...d, itemId, origem: 'manual' });
  await reclassificarSoftwares(itemId);
  await registrar(db(), ref, 'alteracao', usuario, [{ campo: 'software', antigo: null, novo: d.nome }]);
}
