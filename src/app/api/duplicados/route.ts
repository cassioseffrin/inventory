import { z } from 'zod';
import { query, rota } from '@/server/http';
import { listarDuplicados } from '@/server/grupos-duplicados-service';

const CRIT = ['mac', 'numeroSerie', 'hostname', 'ip'] as const;

export const GET = rota(async ({ req }) => {
  const { criterios } = query(
    req,
    z.object({
      criterios: z
        .string()
        .default('mac,numeroSerie,hostname,ip')
        .transform((v) => v.split(','))
        .pipe(z.array(z.enum(CRIT)).min(1)),
    }),
  );
  return listarDuplicados(criterios);
});
