import 'server-only';
import { and, eq, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db/inv';
import { grupos, itens } from '@/db/schema';
import type { Criterios, ItensFiltro } from '@/lib/schemas';
import { criteriosSchema } from '@/lib/schemas';
import { HttpError } from './http';

const like = (v: string) => `%${v.replace(/[\\%_]/g, (c) => '\\' + c)}%`;

/** Colunas de texto que os critérios de grupo dinâmico podem usar. */
const COL_TEXTO = {
  osName: itens.osName,
  osFamily: itens.osFamily,
  hostname: itens.hostname,
  mac: itens.mac,
  setor: itens.setor,
  localizacao: itens.localizacao,
  tag: itens.tag,
  fabricante: itens.fabricante,
  modelo: itens.modelo,
  tipo: itens.tipo,
  status: itens.status,
} as const;

function regraParaSql(r: Criterios['regras'][number]): SQL {
  const v = r.valor ?? '';

  if (r.campo === 'software') {
    const cond =
      r.operador === 'igual'
        ? sql`lower(s.nome) = lower(${v}) OR lower(d.nome_canonico) = lower(${v})`
        : sql`s.nome ILIKE ${like(v)} OR d.nome_canonico ILIKE ${like(v)}`;
    const existe = sql`EXISTS (SELECT 1 FROM inventario.itens_softwares s
      LEFT JOIN inventario.software_dicionario d ON d.id = s.dicionario_id
      WHERE s.item_id = ${itens.id} AND (${cond}))`;
    return r.operador === 'nao_contem' || r.operador === 'diferente' ? sql`NOT ${existe}` : existe;
  }

  if (r.campo === 'diasSemVisto') {
    const dias = Number(v);
    if (!Number.isFinite(dias)) throw new HttpError(400, 'diasSemVisto precisa ser número');
    const corte = sql`now() - make_interval(days => ${dias})`;
    return r.operador === 'menor'
      ? sql`${itens.ultimoVistoMsf} >= ${corte}`
      : sql`(${itens.ultimoVistoMsf} IS NULL OR ${itens.ultimoVistoMsf} < ${corte})`;
  }

  if (r.campo === 'funcionarioId') {
    if (r.operador === 'vazio') return sql`${itens.funcionarioId} IS NULL`;
    if (r.operador === 'nao_vazio') return sql`${itens.funcionarioId} IS NOT NULL`;
    const id = Number(v);
    return r.operador === 'diferente'
      ? sql`${itens.funcionarioId} IS DISTINCT FROM ${id}`
      : sql`${itens.funcionarioId} = ${id}`;
  }

  if (r.campo === 'ip') {
    switch (r.operador) {
      case 'na_subrede':
        return sql`${itens.ip} <<= ${v}::inet`;
      case 'igual':
        return sql`host(${itens.ip}) = ${v}`;
      case 'diferente':
        return sql`host(${itens.ip}) IS DISTINCT FROM ${v}`;
      case 'vazio':
        return sql`${itens.ip} IS NULL`;
      case 'nao_vazio':
        return sql`${itens.ip} IS NOT NULL`;
      default:
        return sql`host(${itens.ip}) ILIKE ${like(v)}`;
    }
  }

  const col = sql`${COL_TEXTO[r.campo]}::text`;
  switch (r.operador) {
    case 'igual':
      return sql`lower(${col}) = lower(${v})`;
    case 'diferente':
      return sql`lower(${col}) IS DISTINCT FROM lower(${v})`;
    case 'contem':
      return sql`${col} ILIKE ${like(v)}`;
    case 'nao_contem':
      return sql`(${col} IS NULL OR ${col} NOT ILIKE ${like(v)})`;
    case 'comeca_com':
      return sql`${col} ILIKE ${v.replace(/[\\%_]/g, (c) => '\\' + c) + '%'}`;
    case 'vazio':
      return sql`(${col} IS NULL OR ${col} = '')`;
    case 'nao_vazio':
      return sql`(${col} IS NOT NULL AND ${col} <> '')`;
    case 'maior':
      return sql`${col} > ${v}`;
    case 'menor':
      return sql`${col} < ${v}`;
    default:
      throw new HttpError(400, `Operador ${r.operador} não suportado para ${r.campo}`);
  }
}

export function compilarCriterios(c: Criterios): SQL {
  const partes = c.regras.map(regraParaSql);
  return (c.combinacao === 'OU' ? or(...partes) : and(...partes))!;
}

/** Condição "pertence ao grupo" — estático via tabela, dinâmico via consulta salva (recalculada a cada uso). */
export async function condicaoGrupo(grupoId: number): Promise<SQL> {
  const [g] = await db().select().from(grupos).where(eq(grupos.id, grupoId));
  if (!g) throw new HttpError(404, 'Grupo não encontrado');
  if (g.tipo === 'estatico') {
    return sql`EXISTS (SELECT 1 FROM inventario.grupos_itens gi WHERE gi.grupo_id = ${grupoId} AND gi.item_id = ${itens.id})`;
  }
  return compilarCriterios(criteriosSchema.parse(g.criterios));
}

export async function whereItens(f: Partial<ItensFiltro>): Promise<SQL | undefined> {
  const c: SQL[] = [];
  if (f.q) {
    const p = like(f.q);
    c.push(
      sql`(${itens.numeroPatrimonio} ILIKE ${p} OR ${itens.hostname} ILIKE ${p} OR host(${itens.ip}) ILIKE ${p}
        OR ${itens.mac} ILIKE ${p} OR ${itens.osName} ILIKE ${p} OR ${itens.tag} ILIKE ${p}
        OR ${itens.numeroSerie} ILIKE ${p} OR ${itens.modelo} ILIKE ${p} OR ${itens.localizacao} ILIKE ${p})`,
    );
  }
  if (f.funcionarioId) c.push(eq(itens.funcionarioId, f.funcionarioId));
  if (f.semResponsavel) c.push(sql`${itens.funcionarioId} IS NULL`);
  if (f.provisorio !== undefined) c.push(eq(itens.patrimonioProvisorio, f.provisorio));
  if (f.setor) c.push(sql`lower(${itens.setor}) = lower(${f.setor})`);
  if (f.status) c.push(eq(itens.status, f.status));
  if (f.tipo) c.push(eq(itens.tipo, f.tipo));
  if (f.tag) c.push(sql`lower(${itens.tag}) = lower(${f.tag})`);
  if (f.naoVistoDias) {
    c.push(
      sql`(${itens.ultimoVistoMsf} IS NULL OR ${itens.ultimoVistoMsf} < now() - make_interval(days => ${f.naoVistoDias}))`,
    );
  }
  if (f.grupoId) c.push(await condicaoGrupo(f.grupoId));
  return c.length ? and(...c) : undefined;
}
