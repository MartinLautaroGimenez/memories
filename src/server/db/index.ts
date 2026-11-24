import 'server-only';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const g = globalThis as unknown as { __memoriesPool?: Pool };

/** El pool se crea recién en la primera consulta, así `next build` no necesita base de datos. */
export const pool: Pool =
  g.__memoriesPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
  });
if (process.env.NODE_ENV !== 'production') g.__memoriesPool = pool;

export const db = drizzle(pool, { schema });
export type DB = typeof db;
export { schema };
