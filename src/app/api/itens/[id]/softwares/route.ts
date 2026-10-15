import { softwareSchema } from '@/lib/schemas';
import { corpo, idParam, rota } from '@/server/http';
import { adicionarSoftware, listarSoftwaresDoItem } from '@/server/cadastros-service';

type P = { id: string };

export const GET = rota<P>(async ({ params }) => listarSoftwaresDoItem(idParam(params.id)));

export const POST = rota<P>(async ({ req, params, sessao }) => {
  await adicionarSoftware(idParam(params.id), await corpo(req, softwareSchema), sessao.username);
  return { ok: true };
});
