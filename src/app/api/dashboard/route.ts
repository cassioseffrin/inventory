import { rota } from '@/server/http';
import { dashboard, dashboardPessoal } from '@/server/dashboard-service';

export const GET = rota(async ({ escopo }) => (escopo ? dashboardPessoal(escopo) : dashboard()), { restrito: true });
