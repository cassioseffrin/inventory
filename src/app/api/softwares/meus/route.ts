import { rota } from '@/server/http';
import { softwaresDoEscopo } from '@/server/dicionario-service';

/** Softwares nos itens que a sessão enxerga (admin não tem escopo: usa o dicionário completo). */
export const GET = rota(async ({ escopo }) => (escopo ? softwaresDoEscopo(escopo) : []), { restrito: true });
