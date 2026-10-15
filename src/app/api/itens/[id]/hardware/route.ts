import { hardwareSchema } from '@/lib/schemas';
import { corpo, idParam, rota } from '@/server/http';
import { salvarHardware } from '@/server/cadastros-service';

export const PUT = rota<{ id: string }>(async ({ req, params, sessao }) => {
  await salvarHardware(idParam(params.id), await corpo(req, hardwareSchema), sessao.username);
  return { ok: true };
});
