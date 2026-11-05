import { rota } from '@/server/http';
import { listarGerentes } from '@/server/cadastros-service';

export const GET = rota(async ({ equipe }) => listarGerentes(equipe), { gerente: true });
