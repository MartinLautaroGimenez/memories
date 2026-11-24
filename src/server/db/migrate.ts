/**
 * Aplica las migraciones pendientes.
 * Se usa desde la línea de comandos (`pnpm db:migrate`) y al arrancar el servidor.
 */
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

export async function runMigrations(connectionString: string, folder = path.join(process.cwd(), 'drizzle')) {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: folder });
  } finally {
    await pool.end();
  }
}

const isCli = process.argv[1] && /migrate\.(ts|js|mjs)$/.test(process.argv[1]);
if (isCli) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('Falta DATABASE_URL.');
    process.exit(1);
  }
  runMigrations(url)
    .then(() => console.log('Migraciones aplicadas.'))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
