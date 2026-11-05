import { rota } from '@/server/http';
import { contadoresMenu, contadoresMenuPessoal } from '@/server/dashboard-service';

export const GET = rota(async ({ escopo }) => (escopo ? contadoresMenuPessoal(escopo) : contadoresMenu()), { restrito: true });
