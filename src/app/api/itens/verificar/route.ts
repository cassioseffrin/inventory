import { z } from 'zod';
import { query, rota } from '@/server/http';
import { hostJaInventariado, patrimonioExiste } from '@/server/itens-service';

/** Usado pelo formulário: patrimônio em uso? host já inventariado? */
export const GET = rota(async ({ req }) => {
  const q = query(
    req,
    z.object({
      patrimonio: z.string().optional(),
      mac: z.string().optional(),
      ip: z.string().optional(),
      hostname: z.string().optional(),
      ignorarId: z.coerce.number().int().optional(),
    }),
  );
  return {
    patrimonioEmUso: q.patrimonio ? await patrimonioExiste(q.patrimonio, q.ignorarId) : false,
    host: q.mac || q.ip ? await hostJaInventariado({ mac: q.mac, ip: q.ip, hostname: q.hostname }, q.ignorarId) : null,
  };
});
