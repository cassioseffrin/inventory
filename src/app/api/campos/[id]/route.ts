import { campoCustomSchema } from '@/lib/schemas';
import { corpo, idParam, rota } from '@/server/http';
import { atualizarCampo, excluirCampo } from '@/server/cadastros-service';

type P = { id: string };

export const PUT = rota<P>(async ({ req, params }) => atualizarCampo(idParam(params.id), await corpo(req, campoCustomSchema)), { admin: true });
export const DELETE = rota<P>(
  async ({ params }) => {
    await excluirCampo(idParam(params.id));
  },
  { admin: true },
);
