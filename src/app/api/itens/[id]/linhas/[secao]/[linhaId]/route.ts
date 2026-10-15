import { discoSchema, interfaceSchema } from '@/lib/schemas';
import { corpo, HttpError, idParam, rota } from '@/server/http';
import { atualizarLinha, removerLinha } from '@/server/cadastros-service';

type P = { id: string; secao: string; linhaId: string };

export const PUT = rota<P>(async ({ req, params }) => {
  if (params.secao === 'discos') return atualizarLinha('discos', idParam(params.id), idParam(params.linhaId), await corpo(req, discoSchema));
  if (params.secao === 'interfaces')
    return atualizarLinha('interfaces', idParam(params.id), idParam(params.linhaId), await corpo(req, interfaceSchema));
  throw new HttpError(404, 'Seção inválida');
});

export const DELETE = rota<P>(async ({ params }) => {
  if (!['discos', 'interfaces', 'softwares'].includes(params.secao)) throw new HttpError(404, 'Seção inválida');
  await removerLinha(params.secao as 'discos', idParam(params.id), idParam(params.linhaId));
});
