import 'server-only';
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { env } from '@/server/env';
import * as schema from './schema';

/** Conexão LEITURA/ESCRITA com o banco do inventário. */
const g = globalThis as unknown as { invPool?: Pool; invDb?: NodePgDatabase<typeof schema> };

export function invPool(): Pool {
  if (!g.invPool) {
    g.invPool = new Pool({ connectionString: env().INV_DATABASE_URL, max: 10, application_name: 'arpa-inventario' });
  }
  return g.invPool;
}

export function db(): NodePgDatabase<typeof schema> {
  if (!g.invDb) g.invDb = drizzle(invPool(), { schema });
  return g.invDb;
}

export type Tx = Parameters<Parameters<NodePgDatabase<typeof schema>['transaction']>[0]>[0];
export type DbOrTx = NodePgDatabase<typeof schema> | Tx;
