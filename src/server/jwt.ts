// Usado também pelo middleware (edge runtime): só depende de `jose`.
import { SignJWT, jwtVerify } from 'jose';

export const COOKIE_NAME = 'inv_token';

export type Papel = 'admin' | 'gerente' | 'comum';

/**
 * `funcionarioId` presente = login de funcionário (CPF); ausente = conta da tabela `usuarios`
 * (acesso de emergência / contas técnicas, sempre admin).
 */
export type Sessao = { id: number; username: string; nome: string; papel: Papel; funcionarioId?: number; senhaProvisoria?: boolean };

const PAPEIS: Papel[] = ['admin', 'gerente', 'comum'];

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error('JWT_SECRET ausente ou curto');
  return new TextEncoder().encode(s);
}

export async function assinarToken(s: Sessao, expiresIn = process.env.JWT_EXPIRES_IN || '8h') {
  return new SignJWT({ username: s.username, nome: s.nome, papel: s.papel, fid: s.funcionarioId, prov: s.senhaProvisoria })
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
    const papel = PAPEIS.includes(payload.papel as Papel) ? (payload.papel as Papel) : 'comum';
    // tokens antigos (antes dos perfis) traziam papel admin/operador e eram sempre da tabela usuarios
    const legado = payload.papel === 'operador';
    return {
      id: Number(payload.sub),
      username: String(payload.username),
      nome: String(payload.nome),
      papel: legado ? 'admin' : papel,
      funcionarioId: typeof payload.fid === 'number' ? payload.fid : undefined,
      senhaProvisoria: payload.prov === true,
    };
  } catch {
    return null;
  }
}
