'use client';
// Cliente HTTP do frontend: JSON, tratamento de erro padronizado e redirecionamento em 401.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detalhes?: unknown,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { 'content-type': 'application/json', ...rest.headers } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: 'same-origin',
  });
  if (res.status === 401 && typeof window !== 'undefined' && !url.includes('/api/auth/login')) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new ApiError(401, 'Sessão expirada');
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.erro ?? `Erro ${res.status}`, body.detalhes);
  return body as T;
}

/** Monta a query string ignorando valores vazios. */
export function qs(params: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    p.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export type Pagina<T> = { dados: T[]; total: number; page: number; pageSize: number };

/** Mensagem legível de um erro (inclui detalhes de validação do Zod quando houver). */
export function mensagemErro(e: unknown): string {
  if (e instanceof ApiError) {
    const d = e.detalhes as { fieldErrors?: Record<string, string[]>; campos?: Record<string, string> } | undefined;
    const extras = d?.fieldErrors
      ? Object.entries(d.fieldErrors).map(([k, v]) => `${k}: ${v.join(', ')}`)
      : d?.campos
        ? Object.entries(d.campos).map(([k, v]) => `${k}: ${v}`)
        : [];
    return [e.message, ...extras].join(' — ');
  }
  return e instanceof Error ? e.message : String(e);
}
