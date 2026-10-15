import { rota } from '@/server/http';
import { atualizarUltimoVisto } from '@/server/sync';

/** Atualiza só o "último visto no msf" de todos os itens (não altera dados). */
export const POST = rota(async () => atualizarUltimoVisto(), { aceitaToken: true });
