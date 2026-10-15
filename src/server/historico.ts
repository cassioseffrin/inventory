import 'server-only';
import { desc, eq, inArray } from 'drizzle-orm';
import { db, type DbOrTx } from '@/db/inv';
import { funcionarios, itensHistorico } from '@/db/schema';
import { texto } from './util';

type Acao = (typeof itensHistorico.$inferInsert)['acao'];

export type Mudanca = { campo: string; antigo: unknown; novo: unknown };

/** Calcula as diferenças campo a campo entre o estado atual e o patch. */
export function diff(atual: Record<string, unknown>, patch: Record<string, unknown>, campos?: string[]): Mudanca[] {
  const out: Mudanca[] = [];
  for (const campo of campos ?? Object.keys(patch)) {
    if (!(campo in patch)) continue;
    const a = texto(atual[campo]);
    const n = texto(patch[campo]);
    if (a !== n) out.push({ campo, antigo: atual[campo], novo: patch[campo] });
  }
  return out;
}

/**
 * Grava mudanças no histórico. A troca de funcionário vira `troca_responsavel`
 * com o nome (e matrícula) dos responsáveis em vez dos ids.
 */
export async function registrar(
  tx: DbOrTx,
  item: { id: number; numeroPatrimonio: string },
  acao: Acao,
  usuario: string,
  mudancas: Mudanca[] = [],
) {
  if (!mudancas.length) {
    await tx.insert(itensHistorico).values({ itemId: item.id, numeroPatrimonio: item.numeroPatrimonio, acao, usuario });
    return;
  }
  const idsFunc = mudancas
    .filter((m) => m.campo === 'funcionarioId')
    .flatMap((m) => [m.antigo, m.novo])
    .filter((v): v is number => typeof v === 'number');
  const nomes = new Map<number, string>();
  if (idsFunc.length) {
    const fs = await tx
      .select({ id: funcionarios.id, nome: funcionarios.nome, matricula: funcionarios.matricula })
      .from(funcionarios)
      .where(inArray(funcionarios.id, idsFunc));
    fs.forEach((f) => nomes.set(f.id, `${f.nome} (${f.matricula})`));
  }
  const fmt = (campo: string, v: unknown) =>
    campo === 'funcionarioId' && typeof v === 'number' ? nomes.get(v) ?? `#${v}` : texto(v);

  await tx.insert(itensHistorico).values(
    mudancas.map((m) => ({
      itemId: item.id,
      numeroPatrimonio: item.numeroPatrimonio,
      acao: m.campo === 'funcionarioId' && acao === 'alteracao' ? ('troca_responsavel' as const) : acao,
      campo: m.campo,
      valorAntigo: fmt(m.campo, m.antigo),
      valorNovo: fmt(m.campo, m.novo),
      usuario,
    })),
  );
}

export async function linhaDoTempo(itemId: number) {
  return db().select().from(itensHistorico).where(eq(itensHistorico.itemId, itemId)).orderBy(desc(itensHistorico.createdAt), desc(itensHistorico.id));
}
