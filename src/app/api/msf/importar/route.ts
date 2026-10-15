import { corpo, rota } from '@/server/http';
import { importacaoSchema, importarHosts } from '@/server/importacao-msf';
import { atualizarUltimoVisto } from '@/server/sync';

/**
 * Importação em massa msf → inventário. Aceita sessão (tela) ou `Authorization: Bearer <IMPORT_API_TOKEN>` (script do Kali).
 * Envie { "simular": true } para dry-run.
 */
export const POST = rota(
  async ({ req, sessao }) => {
    const op = await corpo(req, importacaoSchema);
    const rel = await importarHosts(op, sessao.username);
    const visto = op.simular ? null : await atualizarUltimoVisto();
    return { ...rel, ultimoVisto: visto };
  },
  { aceitaToken: true },
);
