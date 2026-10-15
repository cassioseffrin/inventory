import { idParam, rota } from '@/server/http';
import { obterSecoes } from '@/server/cadastros-service';

export const GET = rota<{ id: string }>(async ({ params }) => obterSecoes(idParam(params.id)));
