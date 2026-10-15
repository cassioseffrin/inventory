import { z } from 'zod';
import { CAMPOS_SYNC } from '@/lib/constants';
import { corpo, idParam, rota } from '@/server/http';
import { aplicarSync, previewSync } from '@/server/sync';

type P = { id: string };

/** Diff entre o item e o host de origem no msf (nada é alterado). */
export const GET = rota<P>(async ({ params }) => previewSync(idParam(params.id)));

/** Aplica apenas os campos escolhidos (IP/hostname/SO…); campos manuais nunca são tocados. */
export const POST = rota<P>(async ({ req, params, sessao }) => {
  const { campos } = await corpo(req, z.object({ campos: z.array(z.enum(CAMPOS_SYNC)) }));
  return aplicarSync(idParam(params.id), campos, sessao.username);
});
