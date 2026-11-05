import { idParam, rota } from '@/server/http';
import { linhaDoTempo } from '@/server/historico';
import { garantirItemNoEscopo } from '@/server/itens-service';

export const GET = rota<{ id: string }>(
  async ({ params, escopo }) => {
    const id = idParam(params.id);
    await garantirItemNoEscopo(id, escopo);
    return linhaDoTempo(id);
  },
  { restrito: true },
);
