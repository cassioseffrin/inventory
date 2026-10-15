import { z } from 'zod';
import { itemBaseSchema, itensFiltroSchema } from '@/lib/schemas';
import { corpo, query, rota } from '@/server/http';
import { criarItem, listarItens } from '@/server/itens-service';

export const GET = rota(async ({ req }) => listarItens(query(req, itensFiltroSchema)));

const criacao = itemBaseSchema.extend({ confirmarDuplicado: z.boolean().optional() });

export const POST = rota(async ({ req, sessao }) => {
  const d = await corpo(req, criacao);
  return Response.json(await criarItem(d, sessao.username), { status: 201 });
});
