import { rota } from '@/server/http';
import { naoClassificados } from '@/server/dicionario-service';

export const GET = rota(async ({ req }) => naoClassificados(req.nextUrl.searchParams.get('q') ?? undefined));
