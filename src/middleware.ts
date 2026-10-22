import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_NAME, verificarToken } from '@/server/jwt';

const PUBLICAS = ['/login', '/api/auth/login'];
/** Rotas que também aceitam `Authorization: Bearer <IMPORT_API_TOKEN>` (validado no handler). */
const COM_TOKEN = ['/api/msf/importar', '/api/msf/ultimo-visto'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLICAS.some((p) => pathname === p)) return NextResponse.next();
  if (COM_TOKEN.includes(pathname) && req.headers.get('authorization')?.startsWith('Bearer ')) return NextResponse.next();

  const sessao = await verificarToken(req.cookies.get(COOKIE_NAME)?.value);
  if (sessao) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png).*)'],
};
