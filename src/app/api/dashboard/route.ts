import { rota } from '@/server/http';
import { dashboard } from '@/server/dashboard-service';

export const GET = rota(async () => dashboard());
