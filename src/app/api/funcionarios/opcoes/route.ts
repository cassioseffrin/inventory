import { rota } from '@/server/http';
import { opcoesFuncionarios } from '@/server/cadastros-service';

/** Select de funcionários; gerente só vê a própria equipe (filtro "Responsável" do inventário). */
export const GET = rota(async ({ req, escopo }) => opcoesFuncionarios(req.nextUrl.searchParams.get('q') ?? undefined, escopo), { restrito: true });
