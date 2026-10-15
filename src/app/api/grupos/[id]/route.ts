import { grupoSchema } from '@/lib/schemas';
import { corpo, idParam, rota } from '@/server/http';
import { atualizarGrupo, excluirGrupo, obterGrupo } from '@/server/grupos-duplicados-service';

type P = { id: string };

export const GET = rota<P>(async ({ params }) => obterGrupo(idParam(params.id)));
export const PUT = rota<P>(async ({ req, params }) => atualizarGrupo(idParam(params.id), await corpo(req, grupoSchema)));
export const DELETE = rota<P>(async ({ params }) => {
  await excluirGrupo(idParam(params.id));
});
