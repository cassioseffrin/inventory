import { idParam, rota } from '@/server/http';
import { removerClassificacao } from '@/server/hosts-service';

export const DELETE = rota<{ id: string }>(async ({ params }) => {
  await removerClassificacao(idParam(params.id));
});
