import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  schemaFilter: ['inventario'],
  dbCredentials: { url: process.env.INV_DATABASE_URL! },
  migrations: { schema: 'inventario', table: '__migrations' },
});
