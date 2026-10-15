import { idParam, rota } from '@/server/http';
import { linhaDoTempo } from '@/server/historico';

export const GET = rota<{ id: string }>(async ({ params }) => linhaDoTempo(idParam(params.id)));
