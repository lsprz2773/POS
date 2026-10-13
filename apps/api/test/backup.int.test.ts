import { randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { sql } from 'kysely';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createBackup, orderedTables, restoreBackup, RestoreError } from '../src/backup/backup';
import { createDb, type Database } from '../src/db/client';
import { createTwoTenants, makeApp, resetData, type Session } from './support/app';

const NOW = new Date('2026-10-15T18:00:00Z');
let db: Database;
let app: FastifyInstance;
let a: Session;
let b: Session;

beforeAll(async () => {
  db = createDb(process.env.TEST_DATABASE_URL!);
  app = makeApp(db, { clock: () => NOW });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.destroy();
});

beforeEach(async () => {
  await resetData(db);
  ({ a, b } = await createTwoTenants(app, db));
});

const post = (s: Session, url: string, payload: object, headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url, headers: { cookie: s.cookie, ...headers }, payload });

/** Una venta pagada, otra con pago anulado y otra cancelada, en la tienda A, y un producto en la B. */
async function seed() {
  const product = (
    await post(a, '/api/products', { name: 'Tamal', price: '25', cost: '14' })
  ).json<{ id: string }>();
  await post(a, '/api/workdays/today/offers', { productId: product.id, quantity: '20' });
  const sale = async (quantity: string, extra: object = {}) =>
    (
      await post(
        a,
        '/api/sales',
        { items: [{ productId: product.id, quantity }], ...extra },
        { 'idempotency-key': randomUUID() },
      )
    ).json<{ id: string }>();
  await sale('2', { payments: [{ method: 'cash', amount: '50.00' }] });
  const second = await sale('3', {
    payments: [
      { method: 'cash', amount: '30.00' },
      { method: 'transfer', amount: '45.00' },
    ],
  });
  await sale('1');
  const cancelled = await sale('4', { payments: [{ method: 'cash', amount: '100.00' }] });
  await post(a, `/api/sales/${cancelled.id}/cancel`, { reason: 'Prueba de respaldo' });
  await post(b, '/api/products', { name: 'Jugo', price: '18', cost: '9' });
  return second;
}

async function counts() {
  const result: Record<string, string> = {};
  for (const table of await orderedTables(db)) {
    const r = await sql<{ n: string }>`select count(*)::text as n from ${sql.table(table)}`.execute(
      db,
    );
    result[table] = r.rows[0]!.n;
  }
  return result;
}

/** Contenido completo (importes, fechas y estados) de las tablas del dinero, para compararlo antes y después. */
const snapshot = async () => {
  const out: Record<string, unknown> = {};
  for (const table of ['sales', 'sale_items', 'payments', 'sale_cancellations', 'daily_offers']) {
    const r = await sql<{ s: unknown }>`
      select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb) as s from ${sql.table(table)} x`.execute(
      db,
    );
    out[table] = r.rows[0]?.s;
  }
  return out;
};

describe('respaldo y restauración', () => {
  it('ordena las tablas para que cada una vaya después de las que referencia', async () => {
    const tables = await orderedTables(db);
    expect(tables).not.toContain('pgmigrations');
    const before = (a: string, b: string) =>
      expect(tables.indexOf(a)).toBeLessThan(tables.indexOf(b));
    before('tenants', 'users');
    before('tenants', 'products');
    before('workdays', 'daily_offers');
    before('daily_offers', 'sale_items');
    before('sales', 'payments');
    before('sales', 'sale_cancellations');
  });

  it('restaura exactamente lo respaldado, con importes, fechas y estados idénticos', async () => {
    await seed();
    const before = await counts();
    expect(Number(before.sales)).toBe(4);
    expect(Number(before.payments)).toBe(4);
    const dataBefore = await snapshot();
    const backup = await createBackup(db, NOW);
    expect(backup.header.lastMigration).toMatch(/sale_cancellations/);
    expect(backup.rows).toBeGreaterThan(10);

    await resetData(db); // la base queda vacía, como una rama nueva de Neon
    expect(Object.values(await counts()).every((n) => n === '0')).toBe(true);

    const restored = await restoreBackup(db, backup.file);
    expect(await counts()).toEqual(before);
    expect(restored.sales).toBe(4);
    expect(await snapshot()).toEqual(dataBefore);

    // Tras restaurar se puede seguir vendiendo: las secuencias continúan después de lo restaurado.
    const product = (
      await post(a, '/api/products', { name: 'Atole', price: '15', cost: '6' })
    ).json<{
      id: string;
    }>();
    expect(product.id).toBeTruthy();
    const audit = await sql<{ ok: boolean }>`
      select count(*) = count(distinct id) as ok from audit_events`.execute(db);
    expect(audit.rows[0]?.ok).toBe(true);
  });

  it('no escribe nada si la base de destino ya tiene datos', async () => {
    await seed();
    const backup = await createBackup(db, NOW);
    await expect(restoreBackup(db, backup.file)).rejects.toBeInstanceOf(RestoreError);
  });

  it('rechaza un archivo que no es un respaldo y un esquema distinto', async () => {
    await resetData(db);
    await expect(restoreBackup(db, gzipSync('{"format":"otro"}\n'))).rejects.toThrow(
      /no es un respaldo/,
    );
    const header = {
      format: 'pos-backup-1',
      createdAt: NOW.toISOString(),
      lastMigration: 'otra',
      tables: [],
    };
    await expect(restoreBackup(db, gzipSync(JSON.stringify(header) + '\n'))).rejects.toThrow(
      /esquema no coincide/,
    );
  });

  it('una restauración fallida no deja filas a medias', async () => {
    await seed();
    const backup = await createBackup(db, NOW);
    await resetData(db);
    // Se corrompe la última fila: la restauración debe revertir todo lo anterior.
    const { gunzipSync } = await import('node:zlib');
    const lines = gunzipSync(backup.file).toString('utf8').trimEnd().split('\n');
    const last = JSON.parse(lines.at(-1)!) as { t: string; r: Record<string, unknown> };
    last.r.id = 'no-es-un-uuid';
    lines[lines.length - 1] = JSON.stringify(last);
    await expect(restoreBackup(db, gzipSync(lines.join('\n') + '\n'))).rejects.toThrow();
    expect(Object.values(await counts()).every((n) => n === '0')).toBe(true);
  });
});
