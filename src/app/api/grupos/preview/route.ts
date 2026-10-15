import { z } from 'zod';
import { corpo, rota } from '@/server/http';
import { previewCriterios } from '@/server/grupos-duplicados-service';

export const POST = rota(async ({ req }) => previewCriterios(await corpo(req, z.unknown())));
