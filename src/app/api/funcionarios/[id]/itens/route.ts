import { z } from 'zod';
import { corpo, idParam, rota } from '@/server/http';
import { associarItensFuncionario } from '@/server/cadastros-service';

type P = { id: string };

const ids = z.array(z.number().int().positive()).max(1000).default([]);
const schema = z.object({ adicionar: ids, remover: ids });

/** Associa/desassocia itens do funcionário em lote. */
export const POST = rota<P>(async ({ req, params, sessao }) =>
  associarItensFuncionario(idParam(params.id), await corpo(req, schema), sessao.username),
);
