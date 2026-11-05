import { rota } from '@/server/http';
import { listarGerentes } from '@/server/cadastros-service';

export const GET = rota(async () => listarGerentes());
