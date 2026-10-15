import { rota } from '@/server/http';

export const GET = rota(async ({ sessao }) => sessao);
