import { idParam, rota } from '@/server/http';
import { obterFoto, removerFoto } from '@/server/cadastros-service';

type P = { id: string; fotoId: string };

/** Imagem binária (`?thumb=1` para a miniatura); fotos não mudam depois de gravadas, então o cache pode ser longo. */
export const GET = rota<P>(async ({ req, params }) => {
  const f = await obterFoto(idParam(params.id), idParam(params.fotoId), new URL(req.url).searchParams.has('thumb'));
  return new Response(Buffer.from(f.dados, 'base64'), {
    headers: { 'content-type': f.mime, 'cache-control': 'private, max-age=31536000, immutable' },
  });
});

export const DELETE = rota<P>(async ({ params, sessao }) => {
  await removerFoto(idParam(params.id), idParam(params.fotoId), sessao.username);
});
