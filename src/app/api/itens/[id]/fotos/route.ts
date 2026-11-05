import { fotoSchema } from '@/lib/schemas';
import { corpo, idParam, rota } from '@/server/http';
import { adicionarFoto, listarFotos } from '@/server/cadastros-service';
import { garantirItemNoEscopo } from '@/server/itens-service';

type P = { id: string };

/** Metadados das fotos (sem o base64; a imagem é servida em /fotos/[fotoId]). */
export const GET = rota<P>(
  async ({ params, escopo }) => {
    const id = idParam(params.id);
    await garantirItemNoEscopo(id, escopo);
    return listarFotos(id);
  },
  { restrito: true },
);

export const POST = rota<P>(async ({ req, params, sessao }) =>
  adicionarFoto(idParam(params.id), await corpo(req, fotoSchema), sessao.username),
);
