import 'server-only';
import { and, asc, desc, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/inv';
import {
  camposCustomizados,
  funcionarios,
  itens,
  itensCamposValores,
  itensCustos,
  itensDiscos,
  itensFotos,
  itensHardware,
  itensInterfaces,
  itensSoftwares,
} from '@/db/schema';
import type { CampoCustomInput, CustoInput, FuncionarioInput } from '@/lib/schemas';
import { diff, registrar } from './historico';
import { HttpError, naoEncontrado, type Pagina } from './http';
import { reclassificarSoftwares } from './dicionario-service';
import { ipSemMascara, normalizarMac } from './util';

// ---------------------------------------------------------------- funcionários

const gerenteNome = sql<string | null>`(SELECT g.nome FROM inventario.funcionarios g WHERE g.id = ${funcionarios.gerenteId})`;

/** O gerente precisa existir e não pode ser o próprio funcionário nem alguém da equipe dele (ciclo). */
async function validarGerente(id: number | null, gerenteId: number | null | undefined) {
  if (!gerenteId) return;
  if (gerenteId === id) throw new HttpError(400, 'O funcionário não pode ser gerente de si mesmo');
  const r = await db().execute<{ id: number; ciclo: boolean }>(sql`
    WITH RECURSIVE cadeia AS (
      SELECT id, gerente_id, 1 AS nivel FROM inventario.funcionarios WHERE id = ${gerenteId}
      UNION ALL
      SELECT f.id, f.gerente_id, c.nivel + 1 FROM inventario.funcionarios f JOIN cadeia c ON f.id = c.gerente_id
      WHERE c.nivel < 50
    )
    SELECT id, (id = ${id ?? 0}) AS ciclo FROM cadeia`);
  if (!r.rows.length) throw new HttpError(400, 'Gerente não encontrado');
  if (r.rows.some((x) => x.ciclo)) throw new HttpError(400, 'Gerente inválido: ele já está abaixo deste funcionário na hierarquia');
}

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
        gerenteNome,
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
  const [f] = await db()
    .select({ ...getTableColumns(funcionarios), gerenteNome })
    .from(funcionarios)
    .where(eq(funcionarios.id, id));
  if (!f) throw naoEncontrado('Funcionário');
  const equipe = await db()
    .select({ id: funcionarios.id, nome: funcionarios.nome, matricula: funcionarios.matricula, setor: funcionarios.setor, ativo: funcionarios.ativo })
    .from(funcionarios)
    .where(eq(funcionarios.gerenteId, id))
    .orderBy(asc(funcionarios.nome));
  const seusItens = await db()
    .select({
      id: itens.id,
      numeroPatrimonio: itens.numeroPatrimonio,
      descricao: itens.descricao,
      hostname: itens.hostname,
      ip: sql<string | null>`host(${itens.ip})`,
      tipo: itens.tipo,
      status: itens.status,
      osName: itens.osName,
      localizacao: itens.localizacao,
      // foto mais recente, a mesma que abre a galeria do item
      fotoId: sql<number | null>`(select f.id from ${itensFotos} f where f.item_id = ${itens.id} order by f.created_at desc, f.id desc limit 1)`,
    })
    .from(itens)
    .where(eq(itens.funcionarioId, id))
    .orderBy(asc(itens.numeroPatrimonio));
  return { ...f, itens: seusItens, equipe };
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
  await validarGerente(null, d.gerenteId);
  const [f] = await db().insert(funcionarios).values(d).returning();
  return f;
}

export async function atualizarFuncionario(id: number, d: Partial<FuncionarioInput>) {
  await validarGerente(id, d.gerenteId);
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

// ---------------------------------------------------------------- fotos do item
const FOTO_MAX_LADO = 1024;

/** Lê largura/altura do marcador SOF de um JPEG (null se não for um JPEG válido). */
function dimensoesJpeg(b: Buffer): { largura: number; altura: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marcador = b[i + 1];
    // SOF0..SOF15, exceto DHT (C4), JPG (C8) e DAC (CC)
    if (marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)) {
      return { altura: b.readUInt16BE(i + 5), largura: b.readUInt16BE(i + 7) };
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

export async function listarFotos(itemId: number) {
  await itemRef(itemId);
  const { dados: _, ...colunas } = getTableColumns(itensFotos);
  return db().select(colunas).from(itensFotos).where(eq(itensFotos.itemId, itemId)).orderBy(desc(itensFotos.createdAt), desc(itensFotos.id));
}

export async function obterFoto(itemId: number, fotoId: number) {
  const [f] = await db()
    .select({ mime: itensFotos.mime, dados: itensFotos.dados })
    .from(itensFotos)
    .where(and(eq(itensFotos.id, fotoId), eq(itensFotos.itemId, itemId)));
  if (!f) throw naoEncontrado('Foto');
  return f;
}

export async function adicionarFoto(itemId: number, dataUrl: string, usuario: string) {
  const ref = await itemRef(itemId);
  const dados = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = Buffer.from(dados, 'base64');
  const dim = dimensoesJpeg(bin);
  if (!dim) throw new HttpError(400, 'Imagem JPEG inválida');
  if (dim.largura > FOTO_MAX_LADO || dim.altura > FOTO_MAX_LADO)
    throw new HttpError(400, `Imagem excede ${FOTO_MAX_LADO}x${FOTO_MAX_LADO} (${dim.largura}x${dim.altura})`);
  const [foto] = await db()
    .insert(itensFotos)
    .values({ itemId, mime: 'image/jpeg', dados, ...dim, tamanhoBytes: bin.length, usuario })
    .returning({ id: itensFotos.id, createdAt: itensFotos.createdAt });
  await registrar(db(), ref, 'alteracao', usuario, [{ campo: 'foto', antigo: null, novo: `#${foto.id} (${dim.largura}x${dim.altura})` }]);
  return foto;
}

export async function removerFoto(itemId: number, fotoId: number, usuario: string) {
  const ref = await itemRef(itemId);
  const r = await db()
    .delete(itensFotos)
    .where(and(eq(itensFotos.id, fotoId), eq(itensFotos.itemId, itemId)))
    .returning({ id: itensFotos.id });
  if (!r.length) throw naoEncontrado('Foto');
  await registrar(db(), ref, 'alteracao', usuario, [{ campo: 'foto', antigo: `#${fotoId}`, novo: null }]);
}

// ---------------------------------------------------------------- custo e depreciação
const CAMPOS_CUSTO = ['valorAquisicao', 'custosAdicionais', 'valorResidual', 'dataInicioUso', 'taxaAnual', 'turnos', 'dataBaixa', 'observacao'];

export async function obterCusto(itemId: number) {
  await itemRef(itemId);
  const [c] = await db().select().from(itensCustos).where(eq(itensCustos.itemId, itemId));
  return c ?? null;
}

export async function salvarCusto(itemId: number, d: CustoInput, usuario: string) {
  const ref = await itemRef(itemId);
  const [atual] = await db().select().from(itensCustos).where(eq(itensCustos.itemId, itemId));
  // numeric volta como string do driver ("1500.00"); converte para comparar com o que veio do formulário
  const antes = atual
    ? {
        ...atual,
        valorAquisicao: Number(atual.valorAquisicao),
        custosAdicionais: Number(atual.custosAdicionais),
        valorResidual: Number(atual.valorResidual),
        taxaAnual: Number(atual.taxaAnual),
      }
    : {};
  const valores = {
    itemId,
    valorAquisicao: d.valorAquisicao.toFixed(2),
    custosAdicionais: d.custosAdicionais.toFixed(2),
    valorResidual: d.valorResidual.toFixed(2),
    dataInicioUso: d.dataInicioUso,
    taxaAnual: d.taxaAnual.toFixed(2),
    turnos: d.turnos,
    dataBaixa: d.dataBaixa ?? null,
    observacao: d.observacao ?? null,
    usuario,
    updatedAt: new Date(),
  };
  await db().insert(itensCustos).values(valores).onConflictDoUpdate({ target: itensCustos.itemId, set: valores });
  const mudancas = diff(antes, { ...d, dataBaixa: d.dataBaixa ?? null, observacao: d.observacao ?? null }, CAMPOS_CUSTO);
  if (mudancas.length) await registrar(db(), ref, 'alteracao', usuario, mudancas);
}

export async function removerCusto(itemId: number, usuario: string) {
  const ref = await itemRef(itemId);
  const r = await db().delete(itensCustos).where(eq(itensCustos.itemId, itemId)).returning({ v: itensCustos.valorAquisicao });
  if (!r.length) throw naoEncontrado('Custo');
  await registrar(db(), ref, 'alteracao', usuario, [{ campo: 'custo', antigo: `aquisição ${r[0].v}`, novo: null }]);
}
