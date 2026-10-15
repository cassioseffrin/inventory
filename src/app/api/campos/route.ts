import { campoCustomSchema } from '@/lib/schemas';
import { corpo, rota } from '@/server/http';
import { criarCampo, listarCampos } from '@/server/cadastros-service';

export const GET = rota(async ({ req }) => listarCampos(req.nextUrl.searchParams.get('ativos') === 'true'));

/** Somente administradores definem campos customizados. */
export const POST = rota(async ({ req }) => Response.json(await criarCampo(await corpo(req, campoCustomSchema)), { status: 201 }), {
  admin: true,
});
