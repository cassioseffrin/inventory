import { dicionarioSchema } from '@/lib/schemas';
import { corpo, rota } from '@/server/http';
import { criarEntrada, listarDicionario, reclassificarSoftwares } from '@/server/dicionario-service';

export const GET = rota(async () => listarDicionario());

export const POST = rota(async ({ req }) => Response.json(await criarEntrada(await corpo(req, dicionarioSchema)), { status: 201 }));

/** Reprocessa o vínculo de todos os softwares com o dicionário. */
export const PATCH = rota(async () => {
  await reclassificarSoftwares();
  return { ok: true };
});
