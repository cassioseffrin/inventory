import { HttpError, idParam, rota } from '@/server/http';
import { criarClassificador } from '@/server/match';
import { detalhesDoHost, notasDoHost, obterHost, servicosDoHost } from '@/server/msf-repo';

/** Host do msf com serviços, host_details e notas (para expandir a linha). */
export const GET = rota<{ id: string }>(async ({ params }) => {
  const id = idParam(params.id);
  const host = await obterHost(id);
  if (!host) throw new HttpError(404, 'Host não encontrado no msf');
  const [servicos, detalhes, notas, classificar] = await Promise.all([
    servicosDoHost(id),
    detalhesDoHost(id),
    notasDoHost(id, 50),
    criarClassificador(),
  ]);
  return { host, classificacao: classificar(host), servicos, detalhes, notas };
});
