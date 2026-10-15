import { z } from 'zod';
import { query, rota } from '@/server/http';
import { montarEstrutura } from '@/server/estrutura-service';

const filtro = z.object({ workspaceId: z.coerce.number().int().optional() });

export const GET = rota(async ({ req }) => montarEstrutura(query(req, filtro).workspaceId));
