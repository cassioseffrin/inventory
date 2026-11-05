import { funcionarioSchema } from '@/lib/schemas';
import { corpo, idParam, rota } from '@/server/http';
import { atualizarFuncionario, excluirFuncionario, garantirNaEquipe, obterFuncionario } from '@/server/cadastros-service';

type P = { id: string };

// gerente: só funcionários da equipe abaixo dele (e nunca um admin, nas alterações)
export const GET = rota<P>(
  async ({ params, equipe }) => {
    const id = idParam(params.id);
    await garantirNaEquipe(id, equipe);
    return obterFuncionario(id);
  },
  { gerente: true },
);

export const PUT = rota<P>(
  async ({ req, params, sessao, equipe }) => {
    const id = idParam(params.id);
    await garantirNaEquipe(id, equipe, true);
    return atualizarFuncionario(id, await corpo(req, funcionarioSchema.partial()), equipe && sessao.funcionarioId ? { equipe, proprioId: sessao.funcionarioId } : null);
  },
  { gerente: true },
);

export const DELETE = rota<P>(
  async ({ params, equipe }) => {
    const id = idParam(params.id);
    await garantirNaEquipe(id, equipe, true);
    await excluirFuncionario(id);
  },
  { gerente: true },
);
