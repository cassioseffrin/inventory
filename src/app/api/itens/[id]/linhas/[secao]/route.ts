import { discoSchema, interfaceSchema } from '@/lib/schemas';
import { corpo, HttpError, idParam, rota } from '@/server/http';
import { adicionarLinha } from '@/server/cadastros-service';

type P = { id: string; secao: string };

export const POST = rota<P>(async ({ req, params, sessao }) => {
  if (params.secao === 'discos') return adicionarLinha('discos', idParam(params.id), await corpo(req, discoSchema), sessao.username);
  if (params.secao === 'interfaces')
    return adicionarLinha('interfaces', idParam(params.id), await corpo(req, interfaceSchema), sessao.username);
  throw new HttpError(404, 'Seção inválida');
});
