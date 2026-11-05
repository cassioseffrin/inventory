import { softwareSchema } from '@/lib/schemas';
import { corpo, idParam, rota } from '@/server/http';
import { adicionarSoftware, listarSoftwaresDoItem } from '@/server/cadastros-service';
import { garantirItemNoEscopo } from '@/server/itens-service';

type P = { id: string };

export const GET = rota<P>(
  async ({ params, escopo }) => {
    const id = idParam(params.id);
    await garantirItemNoEscopo(id, escopo);
    return listarSoftwaresDoItem(id);
  },
  { restrito: true },
);

export const POST = rota<P>(async ({ req, params, sessao }) => {
  await adicionarSoftware(idParam(params.id), await corpo(req, softwareSchema), sessao.username);
  return { ok: true };
});
