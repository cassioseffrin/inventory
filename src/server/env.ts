import 'server-only';
import { z } from 'zod';

const envSchema = z.object({
  MSF_DATABASE_URL: z.string().url(),
  INV_DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET precisa de pelo menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  COOKIE_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  SUBNET_PREFIX: z.coerce.number().int().min(8).max(30).default(24),
  /** token para o script do Kali chamar a importação em massa (vazio = desabilitado) */
  IMPORT_API_TOKEN: z.string().optional().transform((v) => (v && v.length >= 32 ? v : undefined)),
});

let cache: z.infer<typeof envSchema> | undefined;

export function env() {
  if (!cache) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error('Variáveis de ambiente inválidas: ' + JSON.stringify(parsed.error.flatten().fieldErrors));
    }
    cache = parsed.data;
  }
  return cache;
}
