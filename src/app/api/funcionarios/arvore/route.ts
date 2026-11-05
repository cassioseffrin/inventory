import { rota } from '@/server/http';
import { arvoreFuncionarios } from '@/server/cadastros-service';

/** Hierarquia completa (admin) ou só a árvore abaixo do gerente. */
export const GET = rota(async ({ equipe }) => arvoreFuncionarios(equipe), { gerente: true });
