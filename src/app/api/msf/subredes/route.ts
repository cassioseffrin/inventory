import { z } from 'zod';
import { query, rota } from '@/server/http';
import { painelSubredes } from '@/server/hosts-service';

export const GET = rota(async ({ req }) => {
  const { workspaceId } = query(req, z.object({ workspaceId: z.coerce.number().int().optional() }));
  return painelSubredes(workspaceId);
});
