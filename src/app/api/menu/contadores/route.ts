import { rota } from '@/server/http';
import { contadoresMenu } from '@/server/dashboard-service';

export const GET = rota(async () => contadoresMenu());
