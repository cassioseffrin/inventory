// Usado também pelo middleware (edge runtime): só depende de `jose`.
import { SignJWT, jwtVerify } from 'jose';

export const COOKIE_NAME = 'inv_token';

export type Sessao = { id: number; username: string; nome: string; papel: 'admin' | 'operador' };

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error('JWT_SECRET ausente ou curto');
  return new TextEncoder().encode(s);
}

export async function assinarToken(s: Sessao, expiresIn = process.env.JWT_EXPIRES_IN || '8h') {
  return new SignJWT({ username: s.username, nome: s.nome, papel: s.papel })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(s.id))
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret());
}

export async function verificarToken(token: string | undefined): Promise<Sessao | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] });
    return {
      id: Number(payload.sub),
      username: String(payload.username),
      nome: String(payload.nome),
      papel: payload.papel === 'admin' ? 'admin' : 'operador',
    };
  } catch {
    return null;
  }
}
