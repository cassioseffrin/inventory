import { idParam, rota } from '@/server/http';
import { obterFoto, removerFoto } from '@/server/cadastros-service';

type P = { id: string; fotoId: string };

/** Imagem binária; fotos não mudam depois de gravadas, então o cache pode ser longo. */
export const GET = rota<P>(async ({ params }) => {
  const f = await obterFoto(idParam(params.id), idParam(params.fotoId));
  return new Response(Buffer.from(f.dados, 'base64'), {
    headers: { 'content-type': f.mime, 'cache-control': 'private, max-age=31536000, immutable' },
  });
});

export const DELETE = rota<P>(async ({ params, sessao }) => {
  await removerFoto(idParam(params.id), idParam(params.fotoId), sessao.username);
});
