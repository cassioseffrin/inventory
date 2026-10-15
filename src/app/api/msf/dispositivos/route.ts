import { rota } from '@/server/http';
import { listarDispositivos } from '@/server/hosts-service';

export const GET = rota(async () => listarDispositivos());
