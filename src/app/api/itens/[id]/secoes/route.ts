import { idParam, rota } from '@/server/http';
import { obterSecoes } from '@/server/cadastros-service';
import { garantirItemNoEscopo } from '@/server/itens-service';

export const GET = rota<{ id: string }>(
  async ({ params, escopo }) => {
    const id = idParam(params.id);
    await garantirItemNoEscopo(id, escopo);
    return obterSecoes(id);
  },
  { restrito: true },
);
