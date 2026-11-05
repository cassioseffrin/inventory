import { NextResponse, type NextRequest } from 'next/server';
import { loginSchema } from '@/lib/schemas';
import { autenticar } from '@/server/auth-service';
import { env } from '@/server/env';
import { corpo, erroParaResposta } from '@/server/http';
import { assinarToken, COOKIE_NAME } from '@/server/jwt';

export async function POST(req: NextRequest) {
  try {
    const { username, senha } = await corpo(req, loginSchema);
    const sessao = await autenticar(username, senha);
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
