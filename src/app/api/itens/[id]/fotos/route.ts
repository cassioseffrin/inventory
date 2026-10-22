import { fotoSchema } from '@/lib/schemas';
import { corpo, idParam, rota } from '@/server/http';
import { adicionarFoto, listarFotos } from '@/server/cadastros-service';

type P = { id: string };

/** Metadados das fotos (sem o base64; a imagem é servida em /fotos/[fotoId]). */
export const GET = rota<P>(async ({ params }) => listarFotos(idParam(params.id)));

export const POST = rota<P>(async ({ req, params, sessao }) =>
  adicionarFoto(idParam(params.id), await corpo(req, fotoSchema), sessao.username),
);
