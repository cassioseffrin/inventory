import { NextResponse } from 'next/server';
import { alterarSenhaSchema } from '@/lib/schemas';
import { alterarSenha } from '@/server/auth-service';
import { env } from '@/server/env';
import { corpo, rota } from '@/server/http';
import { assinarToken, COOKIE_NAME } from '@/server/jwt';

/** Troca a própria senha. Reemite o token para tirar o aviso de senha provisória. */
export const PUT = rota(
  async ({ req, sessao }) => {
    const { atual, nova } = await corpo(req, alterarSenhaSchema);
    await alterarSenha(sessao, atual, nova);
    const novaSessao = { ...sessao, senhaProvisoria: false };
    const res = NextResponse.json(novaSessao);
    res.cookies.set(COOKIE_NAME, await assinarToken(novaSessao, env().JWT_EXPIRES_IN), {
      httpOnly: true,
      sameSite: 'lax',
      secure: env().COOKIE_SECURE,
      path: '/',
    });
    return res;
  },
  { restrito: true },
);
