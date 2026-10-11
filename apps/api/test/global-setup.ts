import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { runner } from 'node-pg-migrate';

const DEFAULT_URL = 'postgres://pos@localhost:5432/pos_test';

/** Recrea el esquema de la base de pruebas y aplica todas las migraciones desde cero. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? DEFAULT_URL;
  process.env.TEST_DATABASE_URL = url;

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  } finally {
    await client.end();
  }

  await runner({
    databaseUrl: url,
    dir: fileURLToPath(new URL('../migrations', import.meta.url)),
    direction: 'up',
    migrationsTable: 'pgmigrations',
    log: () => {},
  });
}
