import { z } from 'zod';
import { query, rota } from '@/server/http';
import { montarEstrutura } from '@/server/estrutura-service';

const filtro = z.object({
  workspaceId: z.coerce.number().int().optional(),
  escopo: z.enum(['apenas_msf', 'todos_inventario']).optional(),
});

export const GET = rota(async ({ req }) => {
  const { workspaceId, escopo } = query(req, filtro);
  return montarEstrutura(workspaceId, escopo ?? 'todos_inventario');
});
