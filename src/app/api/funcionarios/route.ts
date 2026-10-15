import { z } from 'zod';
import { funcionarioSchema } from '@/lib/schemas';
import { corpo, query, rota } from '@/server/http';
import { criarFuncionario, listarFuncionarios } from '@/server/cadastros-service';

const filtro = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
  q: z.string().trim().optional(),
  setor: z.string().optional(),
  ativo: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export const GET = rota(async ({ req }) => listarFuncionarios(query(req, filtro)));

export const POST = rota(async ({ req }) => Response.json(await criarFuncionario(await corpo(req, funcionarioSchema)), { status: 201 }));
