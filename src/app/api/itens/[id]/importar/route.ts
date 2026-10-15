import { HttpError, idParam, rota } from '@/server/http';
import { aplicarColeta, interpretarArquivo } from '@/server/importacao-arquivo';

const MAX = 10 * 1024 * 1024;

/** Upload (multipart, campo `arquivo`) de JSON/CSV/XML de coleta de software/hardware. */
export const POST = rota<{ id: string }>(async ({ req, params, sessao }) => {
  const form = await req.formData().catch(() => null);
  const arquivo = form?.get('arquivo');
  if (!(arquivo instanceof File)) throw new HttpError(400, 'Envie o arquivo no campo "arquivo"');
  if (arquivo.size > MAX) throw new HttpError(413, 'Arquivo maior que 10 MB');
  const coleta = interpretarArquivo(arquivo.name, await arquivo.text());
  return aplicarColeta(idParam(params.id), coleta, sessao.username, { atualizarItem: form?.get('atualizarItem') === 'true' });
});
