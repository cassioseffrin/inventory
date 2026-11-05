import { itemUpdateSchema } from '@/lib/schemas';
import { corpo, idParam, rota } from '@/server/http';
import { atualizarItem, excluirItem, garantirItemNoEscopo, obterItem } from '@/server/itens-service';

type P = { id: string };

export const GET = rota<P>(
  async ({ params, escopo }) => {
    const id = idParam(params.id);
    await garantirItemNoEscopo(id, escopo);
    return obterItem(id);
  },
  { restrito: true },
);

export const PATCH = rota<P>(async ({ req, params, sessao }) =>
  atualizarItem(idParam(params.id), await corpo(req, itemUpdateSchema), sessao.username),
);

export const DELETE = rota<P>(async ({ params, sessao }) => {
  await excluirItem(idParam(params.id), sessao.username);
});
