import { rota } from '@/server/http';
import { valoresDistintos } from '@/server/itens-service';

export const GET = rota(async () => valoresDistintos());
