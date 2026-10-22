import { custoSchema } from '@/lib/schemas';
import { corpo, idParam, rota } from '@/server/http';
import { obterCusto, removerCusto, salvarCusto } from '@/server/cadastros-service';

type P = { id: string };

/** Parâmetros de custo/depreciação do item (null se ainda não cadastrados); o cálculo fica em lib/depreciacao. */
export const GET = rota<P>(async ({ params }) => obterCusto(idParam(params.id)));

export const PUT = rota<P>(async ({ req, params, sessao }) => {
  await salvarCusto(idParam(params.id), await corpo(req, custoSchema), sessao.username);
  return { ok: true };
});

export const DELETE = rota<P>(async ({ params, sessao }) => {
  await removerCusto(idParam(params.id), sessao.username);
});
