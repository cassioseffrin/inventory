import { eq } from 'drizzle-orm';
import { db } from '@/db/inv';
import { itens } from '@/db/schema';
import { idParam, naoEncontrado, rota } from '@/server/http';
import { servicosDoHost } from '@/server/msf-repo';
import { encontrarHostDoItem } from '@/server/sync';

/** Aba "Serviços (msf)": portas do host de origem, somente leitura. */
export const GET = rota<{ id: string }>(async ({ params }) => {
  const [item] = await db().select().from(itens).where(eq(itens.id, idParam(params.id)));
  if (!item) throw naoEncontrado('Item');
  const origem = await encontrarHostDoItem(item);
  if (!origem) return { host: null, criterio: null, servicos: [] };
  return {
    host: { id: origem.host.id, address: origem.host.address, workspace: origem.host.workspace, updatedAt: origem.host.updated_at },
    criterio: origem.criterio,
    servicos: await servicosDoHost(origem.host.id),
  };
});
