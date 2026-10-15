import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/db/inv';
import { usuarios } from '@/db/schema';
import { loginSchema } from '@/lib/schemas';
import { env } from '@/server/env';
import { corpo, erroParaResposta, HttpError } from '@/server/http';
import { assinarToken, COOKIE_NAME } from '@/server/jwt';

// hash fixo para manter o tempo de resposta igual quando o usuário não existe
const HASH_FALSO = bcrypt.hashSync('senha-inexistente', 12);

export async function POST(req: NextRequest) {
  try {
    const { username, senha } = await corpo(req, loginSchema);
    const [u] = await db().select().from(usuarios).where(eq(usuarios.username, username));
    const ok = await bcrypt.compare(senha, u?.senhaHash ?? HASH_FALSO);
    if (!u || !ok || !u.ativo) throw new HttpError(401, 'Usuário ou senha inválidos');

    const sessao = { id: u.id, username: u.username, nome: u.nome, papel: u.papel };
    const token = await assinarToken(sessao, env().JWT_EXPIRES_IN);
    const res = NextResponse.json(sessao);
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env().COOKIE_SECURE,
      path: '/',
    });
    return res;
  } catch (e) {
    return erroParaResposta(e);
  }
}
