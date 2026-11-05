import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/inv';
import { funcionarios, usuarios } from '@/db/schema';
import { soDigitos } from '@/lib/cpf';
import { HttpError, naoEncontrado } from './http';
import type { Papel, Sessao } from './jwt';

// hash fixo para manter o tempo de resposta igual quando o usuário não existe
const HASH_FALSO = bcrypt.hashSync('senha-inexistente', 12);
const CUSTO = 12;

const iguais = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

const temEquipe = sql<boolean>`EXISTS (SELECT 1 FROM inventario.funcionarios s WHERE s.gerente_id = ${funcionarios}.id)`;

const papelDe = (f: { admin: boolean; temEquipe: boolean }): Papel => (f.admin ? 'admin' : f.temEquipe ? 'gerente' : 'comum');

/**
 * Login único: um CPF (com ou sem máscara) entra como funcionário; qualquer outro texto
 * é procurado na tabela `usuarios` (contas de emergência/técnicas, sempre admin).
 */
export async function autenticar(login: string, senha: string): Promise<Sessao> {
  const cpf = soDigitos(login);
  if (cpf.length === 11 && /^[\d.\-\s]+$/.test(login)) {
    const [f] = await db()
      .select({ id: funcionarios.id, nome: funcionarios.nome, matricula: funcionarios.matricula, cpf: funcionarios.cpf, senhaHash: funcionarios.senhaHash, admin: funcionarios.admin, ativo: funcionarios.ativo, temEquipe })
      .from(funcionarios)
      .where(eq(funcionarios.cpf, cpf));
    // senha provisória (hash NULL) = o próprio CPF; ainda assim roda o bcrypt para não vazar pelo tempo
    const okHash = await bcrypt.compare(senha, f?.senhaHash ?? HASH_FALSO);
    const ok = f?.senhaHash ? okHash : !!f && iguais(soDigitos(senha), cpf) && /^[\d.\-\s]+$/.test(senha);
    if (!f || !ok || !f.ativo) throw new HttpError(401, 'Usuário ou senha inválidos');
    return { id: f.id, username: f.matricula, nome: f.nome, papel: papelDe(f), funcionarioId: f.id, senhaProvisoria: !f.senhaHash };
  }
  const [u] = await db().select().from(usuarios).where(eq(usuarios.username, login));
  const ok = await bcrypt.compare(senha, u?.senhaHash ?? HASH_FALSO);
  if (!u || !ok || !u.ativo) throw new HttpError(401, 'Usuário ou senha inválidos');
  return { id: u.id, username: u.username, nome: u.nome, papel: 'admin' };
}

/**
 * Revalida a sessão de funcionário a cada requisição: o token vale horas, mas inativação,
 * perda do perfil admin ou mudança de equipe precisam valer na hora.
 * Devolve o papel atual e o escopo (ids de funcionários cujos itens a pessoa enxerga; null = tudo).
 */
export async function resolverAcesso(s: Sessao): Promise<{ papel: Papel; escopo: number[] | null }> {
  if (!s.funcionarioId) return { papel: s.papel, escopo: null };
  const [f] = await db()
    .select({ admin: funcionarios.admin, ativo: funcionarios.ativo, temEquipe })
    .from(funcionarios)
    .where(eq(funcionarios.id, s.funcionarioId));
  if (!f || !f.ativo) throw new HttpError(401, 'Não autenticado');
  const papel = papelDe(f);
  if (papel === 'admin') return { papel, escopo: null };
  if (papel === 'comum') return { papel, escopo: [s.funcionarioId] };
  // gerente: ele + toda a árvore abaixo dele (limite de profundidade contra dados ruins)
  const r = await db().execute<{ id: number }>(sql`
    WITH RECURSIVE equipe AS (
      SELECT id, 1 AS nivel FROM inventario.funcionarios WHERE id = ${s.funcionarioId}
      UNION
      SELECT f.id, e.nivel + 1 FROM inventario.funcionarios f JOIN equipe e ON f.gerente_id = e.id WHERE e.nivel < 50
    )
    SELECT DISTINCT id FROM equipe`);
  return { papel, escopo: r.rows.map((x) => Number(x.id)) };
}

export function validarNovaSenha(nova: string, cpf?: string | null) {
  if (nova.length < 8) throw new HttpError(400, 'A nova senha precisa ter ao menos 8 caracteres');
  if (cpf && soDigitos(nova) === cpf && /^[\d.\-\s]+$/.test(nova)) throw new HttpError(400, 'A nova senha não pode ser o CPF');
}

/** Troca a própria senha (funcionário ou conta de `usuarios`), conferindo a atual. */
export async function alterarSenha(s: Sessao, atual: string, nova: string) {
  if (s.funcionarioId) {
    const [f] = await db().select({ cpf: funcionarios.cpf, senhaHash: funcionarios.senhaHash }).from(funcionarios).where(eq(funcionarios.id, s.funcionarioId));
    if (!f) throw naoEncontrado('Funcionário');
    const ok = f.senhaHash ? await bcrypt.compare(atual, f.senhaHash) : !!f.cpf && iguais(soDigitos(atual), f.cpf);
    if (!ok) throw new HttpError(400, 'Senha atual incorreta');
    validarNovaSenha(nova, f.cpf);
    await db().update(funcionarios).set({ senhaHash: await bcrypt.hash(nova, CUSTO), updatedAt: new Date() }).where(eq(funcionarios.id, s.funcionarioId));
    return;
  }
  const [u] = await db().select({ senhaHash: usuarios.senhaHash }).from(usuarios).where(eq(usuarios.id, s.id));
  if (!u || !(await bcrypt.compare(atual, u.senhaHash))) throw new HttpError(400, 'Senha atual incorreta');
  validarNovaSenha(nova);
  await db().update(usuarios).set({ senhaHash: await bcrypt.hash(nova, CUSTO), updatedAt: new Date() }).where(eq(usuarios.id, s.id));
}

/** Admin: volta a senha do funcionário para a provisória (o CPF). */
export async function resetarSenhaFuncionario(id: number) {
  const r = await db().update(funcionarios).set({ senhaHash: null, updatedAt: new Date() }).where(eq(funcionarios.id, id)).returning({ id: funcionarios.id });
  if (!r.length) throw naoEncontrado('Funcionário');
}
