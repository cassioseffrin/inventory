import { z } from 'zod';
import { query, rota } from '@/server/http';
import { listarHostsClassificados } from '@/server/hosts-service';

const SITUACOES = ['inventariado', 'provavel', 'conhecido', 'ignorado', 'desconhecido'] as const;

const filtro = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
  sort: z.string().optional(),
  dir: z.enum(['asc', 'desc']).default('asc'),
  q: z.string().trim().optional(),
  workspaceId: z.coerce.number().int().optional(),
  subrede: z.string().trim().optional(),
  grupoId: z.coerce.number().int().optional(),
  situacao: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',') : undefined))
    .pipe(z.array(z.enum(SITUACOES)).optional()),
});

export const GET = rota(async ({ req }) => listarHostsClassificados(query(req, filtro)));
