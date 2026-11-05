import { rota } from '@/server/http';
import { valoresDistintos } from '@/server/itens-service';

/** Valores para os filtros da lista (setor, tag, localização...): leitura liberada a todos os perfis. */
export const GET = rota(async () => valoresDistintos(), { restrito: true });
