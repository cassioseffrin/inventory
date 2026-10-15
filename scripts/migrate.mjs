// Aplica as migrations versionadas em ./drizzle no banco do inventário.
// .env é opcional (no Docker as variáveis vêm do compose)
try { await import('dotenv/config'); } catch {}
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pool = new pg.Pool({ connectionString: process.env.INV_DATABASE_URL, max: 1 });
try {
  await migrate(drizzle(pool), {
    migrationsFolder: path.join(root, 'drizzle'),
    migrationsSchema: 'inventario',
    migrationsTable: '__migrations',
  });
  console.log('migrations aplicadas.');
} catch (e) {
  console.error('falha nas migrations:', e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
