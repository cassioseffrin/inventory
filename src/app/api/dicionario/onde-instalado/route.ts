import { z } from 'zod';
import { HttpError, query, rota } from '@/server/http';
import { ondeInstalado } from '@/server/dicionario-service';

export const GET = rota(async ({ req }) => {
  const f = query(req, z.object({ dicionarioId: z.coerce.number().int().optional(), nome: z.string().trim().min(2).optional() }));
  if (!f.dicionarioId && !f.nome) throw new HttpError(400, 'Informe dicionarioId ou nome');
  return ondeInstalado(f);
});
