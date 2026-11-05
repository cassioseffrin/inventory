import { z } from 'zod';
import { corpo, idParam, rota } from '@/server/http';
import { associarItensFuncionario, garantirNaEquipe } from '@/server/cadastros-service';

type P = { id: string };

const ids = z.array(z.number().int().positive()).max(1000).default([]);
const schema = z.object({ adicionar: ids, remover: ids });

/** Associa/desassocia itens do funcionário em lote. Gerente: só entre itens da própria equipe. */
export const POST = rota<P>(
  async ({ req, params, sessao, escopo, equipe }) => {
    const id = idParam(params.id);
    await garantirNaEquipe(id, equipe, true);
    return associarItensFuncionario(id, await corpo(req, schema), sessao.username, escopo);
  },
  { gerente: true },
);
