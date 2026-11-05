import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/inv';
import { funcionarios } from '@/db/schema';

/**
 * Organograma da empresa inteira, visível para todos os perfis. Seleciona só os campos
 * públicos de propósito: nunca CPF, senha, celular, perfil admin nem dados de inventário.
 * `podeAbrir` diz se quem consulta tem acesso à ficha (admin: todas; gerente: a equipe).
 */
export async function organograma(equipe: number[] | null) {
  const r = await db()
    .select({ id: funcionarios.id, nome: funcionarios.nome, setor: funcionarios.setor, email: funcionarios.email, ramal: funcionarios.ramal, gerenteId: funcionarios.gerenteId })
    .from(funcionarios)
    .where(eq(funcionarios.ativo, true))
    .orderBy(asc(funcionarios.nome));
  return r.map((f) => ({ ...f, podeAbrir: equipe === null || equipe.includes(f.id) }));
}
