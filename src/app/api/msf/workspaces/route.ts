import { rota } from '@/server/http';
import { listarWorkspaces } from '@/server/msf-repo';

export const GET = rota(async () => listarWorkspaces());
