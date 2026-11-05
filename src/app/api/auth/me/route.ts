import { rota } from '@/server/http';

/** Sessão atual com o papel revalidado no banco (pode ter mudado desde o login). */
export const GET = rota(async ({ sessao }) => sessao, { restrito: true });
