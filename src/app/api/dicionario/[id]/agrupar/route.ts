import { z } from 'zod';
import { corpo, idParam, rota } from '@/server/http';
import { agrupar } from '@/server/dicionario-service';

export const POST = rota<{ id: string }>(async ({ req, params }) => {
  const { nomes } = await corpo(req, z.object({ nomes: z.array(z.string().trim().min(1).max(255)).min(1) }));
  await agrupar(idParam(params.id), nomes);
  return { ok: true };
});
