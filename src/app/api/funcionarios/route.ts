import { z } from 'zod';
import { funcionarioSchema } from '@/lib/schemas';
import { corpo, query, rota } from '@/server/http';
import { criarFuncionario, listarFuncionarios } from '@/server/cadastros-service';

const filtro = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
  q: z.string().trim().optional(),
  setor: z.string().optional(),
  gerenteId: z.coerce.number().int().positive().optional(),
  soGerentes: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  ativo: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

/** Admin vê todos; gerente só a equipe abaixo dele. */
export const GET = rota(async ({ req, equipe }) => listarFuncionarios(query(req, filtro), equipe), { gerente: true });

export const POST = rota(
  async ({ req, sessao, equipe }) =>
    Response.json(
      await criarFuncionario(await corpo(req, funcionarioSchema), equipe && sessao.funcionarioId ? { equipe, proprioId: sessao.funcionarioId } : null),
      { status: 201 },
    ),
  { gerente: true },
);
