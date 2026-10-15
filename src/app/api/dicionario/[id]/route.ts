import { dicionarioSchema } from '@/lib/schemas';
import { corpo, idParam, rota } from '@/server/http';
import { atualizarEntrada, excluirEntrada } from '@/server/dicionario-service';

type P = { id: string };

export const PUT = rota<P>(async ({ req, params }) => atualizarEntrada(idParam(params.id), await corpo(req, dicionarioSchema)));
export const DELETE = rota<P>(async ({ params }) => {
  await excluirEntrada(idParam(params.id));
});
