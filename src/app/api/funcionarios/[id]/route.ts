import { funcionarioSchema } from '@/lib/schemas';
import { corpo, idParam, rota } from '@/server/http';
import { atualizarFuncionario, excluirFuncionario, obterFuncionario } from '@/server/cadastros-service';

type P = { id: string };

export const GET = rota<P>(async ({ params }) => obterFuncionario(idParam(params.id)));
export const PUT = rota<P>(async ({ req, params }) => atualizarFuncionario(idParam(params.id), await corpo(req, funcionarioSchema.partial())));
export const DELETE = rota<P>(async ({ params }) => {
  await excluirFuncionario(idParam(params.id));
});
