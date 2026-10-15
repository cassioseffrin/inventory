import { rota } from '@/server/http';
import { alertasProibidos } from '@/server/dicionario-service';

export const GET = rota(async () => alertasProibidos());
