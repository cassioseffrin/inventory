import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { env } from './env';
import { COOKIE_NAME, verificarToken, type Sessao } from './jwt';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public detalhes?: unknown,
  ) {
    super(message);
  }
}

export const naoEncontrado = (o = 'Registro') => new HttpError(404, `${o} não encontrado`);

type Ctx<P> = { req: NextRequest; params: P; sessao: Sessao };
type Opts = { admin?: boolean; aceitaToken?: boolean };

function sessaoPorToken(req: NextRequest): Sessao | null {
  const esperado = env().IMPORT_API_TOKEN;
  const h = req.headers.get('authorization');
  if (!esperado || !h?.startsWith('Bearer ')) return null;
  const a = Buffer.from(h.slice(7).trim());
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { id: 0, username: 'api-token', nome: 'Token de API', papel: 'operador' };
}

/**
 * Envolve um route handler: exige sessão válida (o middleware já barra, aqui é defesa em profundidade),
 * opcionalmente papel admin, e converte erros em respostas JSON consistentes.
 */
export function rota<P = Record<string, string>>(
  fn: (ctx: Ctx<P>) => Promise<Response | unknown>,
  opts: Opts = {},
) {
  return async (req: NextRequest, segment: { params: Promise<P> }) => {
    try {
      const sessao =
        (await verificarToken((await cookies()).get(COOKIE_NAME)?.value)) ?? (opts.aceitaToken ? sessaoPorToken(req) : null);
      if (!sessao) throw new HttpError(401, 'Não autenticado');
      if (opts.admin && sessao.papel !== 'admin') throw new HttpError(403, 'Requer perfil administrador');
      const params = (segment?.params ? await segment.params : {}) as P;
      const out = await fn({ req, params, sessao });
      if (out instanceof Response) return out;
      if (out === undefined) return new NextResponse(null, { status: 204 });
      return NextResponse.json(out);
    } catch (e) {
      return erroParaResposta(e);
    }
  };
}

export function erroParaResposta(e: unknown) {
  if (e instanceof HttpError) {
    return NextResponse.json({ erro: e.message, detalhes: e.detalhes }, { status: e.status });
  }
  if (e instanceof ZodError) {
    return NextResponse.json({ erro: 'Dados inválidos', detalhes: e.flatten() }, { status: 400 });
  }
  const pg = e as { code?: string; constraint?: string; detail?: string; cause?: { code?: string; constraint?: string; detail?: string } };
  const err = pg?.code ? pg : pg?.cause; // drizzle encapsula o erro do driver em `cause`
  if (err?.code === '23505') {
    const msg = err.constraint?.includes('numero_patrimonio')
      ? 'Número de patrimônio já cadastrado'
      : err.constraint?.includes('matricula')
        ? 'Matrícula já cadastrada'
        : err.constraint?.includes('cpf')
          ? 'CPF já cadastrado'
          : err.constraint?.includes('mac')
            ? 'MAC já cadastrado em outro item'
            : 'Registro duplicado';
    return NextResponse.json({ erro: msg, detalhes: err.detail }, { status: 409 });
  }
  if (err?.code === '23514' && err.constraint?.includes('gerente')) {
    return NextResponse.json({ erro: 'O funcionário não pode ser gerente de si mesmo' }, { status: 400 });
  }
  if (err?.code === '23503') {
    return NextResponse.json({ erro: 'Registro referenciado por outro', detalhes: err.detail }, { status: 409 });
  }
  if (err?.code === '22P02') {
    return NextResponse.json({ erro: 'Valor em formato inválido', detalhes: err.detail }, { status: 400 });
  }
  console.error('[api] erro inesperado', e);
  return NextResponse.json({ erro: 'Erro interno' }, { status: 500 });
}

export async function corpo<S extends ZodTypeAny>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new HttpError(400, 'JSON inválido');
  }
  return schema.parse(json);
}

export function query<S extends ZodTypeAny>(req: NextRequest, schema: S): z.infer<S> {
  const obj: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    if (v !== '') obj[k] = v;
  });
  return schema.parse(obj);
}

export function idParam(v: string | undefined): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'id inválido');
  return n;
}

export type Pagina<T> = { dados: T[]; total: number; page: number; pageSize: number };
