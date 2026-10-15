import { z } from 'zod';
import { corpo, rota } from '@/server/http';
import { mesclar } from '@/server/grupos-duplicados-service';

const schema = z.object({
  manterId: z.number().int(),
  removerId: z.number().int(),
  escolhas: z.record(z.string(), z.enum(['manter', 'remover'])).default({}),
});

export const POST = rota(async ({ req, sessao }) => {
  const d = await corpo(req, schema);
  return mesclar(d.manterId, d.removerId, d.escolhas, sessao.username);
});
