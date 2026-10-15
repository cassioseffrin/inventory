import { grupoSchema } from '@/lib/schemas';
import { corpo, rota } from '@/server/http';
import { criarGrupo, listarGrupos } from '@/server/grupos-duplicados-service';

export const GET = rota(async () => listarGrupos());
export const POST = rota(async ({ req }) => Response.json(await criarGrupo(await corpo(req, grupoSchema)), { status: 201 }));
