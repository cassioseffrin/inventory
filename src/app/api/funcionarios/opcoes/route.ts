import { rota } from '@/server/http';
import { opcoesFuncionarios } from '@/server/cadastros-service';

export const GET = rota(async ({ req }) => opcoesFuncionarios(req.nextUrl.searchParams.get('q') ?? undefined));
