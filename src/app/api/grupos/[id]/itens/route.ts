import { z } from 'zod';
import { corpo, idParam, rota } from '@/server/http';
import { adicionarAoGrupo, removerDoGrupo } from '@/server/grupos-duplicados-service';

type P = { id: string };
const ids = z.object({ itemIds: z.array(z.number().int()).min(1).max(5000) });

export const POST = rota<P>(async ({ req, params }) => {
  await adicionarAoGrupo(idParam(params.id), (await corpo(req, ids)).itemIds);
  return { ok: true };
});
export const DELETE = rota<P>(async ({ req, params }) => {
  await removerDoGrupo(idParam(params.id), (await corpo(req, ids)).itemIds);
  return { ok: true };
});
