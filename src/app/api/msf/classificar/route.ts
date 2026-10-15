import { z } from 'zod';
import { classificarSchema } from '@/lib/schemas';
import { corpo, rota } from '@/server/http';
import { classificarDispositivo } from '@/server/hosts-service';

const lote = z.object({ dispositivos: z.array(classificarSchema).min(1).max(1000) });

/** Classifica um ou vários hosts desconhecidos como "conhecido" ou "ignorado". */
export const POST = rota(async ({ req, sessao }) => {
  const { dispositivos } = await corpo(req, lote);
  for (const d of dispositivos) await classificarDispositivo(d, sessao.username);
  return { classificados: dispositivos.length };
});
