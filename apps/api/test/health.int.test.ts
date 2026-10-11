import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { makeApp } from './support/app';
import { createDb, type Database } from '../src/db/client';

let db: Database;

beforeAll(() => {
  db = createDb(process.env.TEST_DATABASE_URL!);
});

afterAll(async () => {
  await db.destroy();
});

describe('base de datos de pruebas', () => {
  it('aplica las migraciones desde cero', async () => {
    const result = await sql<{ name: string }>`select name from pgmigrations order by id`.execute(
      db,
    );
    expect(result.rows.map((r) => r.name)).toContain('1760140800000_baseline');
  });

  it('tiene la función set_updated_at', async () => {
    const result = await sql<{ n: number }>`
      select count(*)::int as n from pg_proc where proname = 'set_updated_at'`.execute(db);
    expect(result.rows[0]?.n).toBe(1);
  });
});

describe('GET /api/health/ready con base real', () => {
  it('responde ok', async () => {
    const app = makeApp(db);
    const response = await app.inject({ method: 'GET', url: '/api/health/ready' });
    expect(response.statusCode).toBe(200);
    await app.close();
  });
});
