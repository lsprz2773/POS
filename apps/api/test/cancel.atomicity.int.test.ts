import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDb, type Database } from '../src/db/client';
import { cancelSale } from '../src/modules/sales/cancel.usecases';
import { resetData } from './support/app';

// Simula que la auditoría no se puede guardar: la cancelación no debe confirmarse.
vi.mock('../src/modules/audit/audit', () => ({
  recordAudit: vi.fn().mockRejectedValue(new Error('auditoría no disponible')),
}));

const clock = () => new Date('2026-10-15T18:00:00Z');

let db: Database;

beforeAll(() => {
  db = createDb(process.env.TEST_DATABASE_URL!);
});

afterAll(async () => {
  await db.destroy();
});

beforeEach(async () => {
  await resetData(db);
});

describe('transacción de cancelación + auditoría', () => {
  it('si la auditoría falla, la venta sigue vigente y no queda registro de cancelación', async () => {
    const tenant = await db
      .insertInto('tenants')
      .values({ name: 'Original' })
      .returning('id')
      .executeTakeFirstOrThrow();
    await db.insertInto('store_settings').values({ tenant_id: tenant.id }).execute();
    const user = await db
      .insertInto('users')
      .values({ email: 'x@test.test', identity_subject: 'local:x@test.test' })
      .returning('id')
      .executeTakeFirstOrThrow();
    const workday = await db
      .insertInto('workdays')
      .values({
        tenant_id: tenant.id,
        business_date: '2026-10-15',
        start_time: '08:00',
        end_time: '16:00',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await db.insertInto('sale_counters').values({ tenant_id: tenant.id, last_folio: 1 }).execute();
    const sale = await db
      .insertInto('sales')
      .values({
        tenant_id: tenant.id,
        workday_id: workday.id,
        folio: 1,
        total: '0.00',
        created_by: user.id,
        idempotency_key: randomUUID(),
        request_hash: 'b'.repeat(64),
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const ctx = {
      userId: user.id,
      email: 'x@test.test',
      tenantId: tenant.id,
      tenantName: 'Original',
      role: 'owner' as const,
    };
    await expect(cancelSale(db, ctx, sale.id, { reason: 'Prueba' }, clock)).rejects.toThrow(
      /auditoría/,
    );

    const row = await db
      .selectFrom('sales')
      .select('status')
      .where('id', '=', sale.id)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('active');
    expect(await db.selectFrom('sale_cancellations').select('id').execute()).toHaveLength(0);
  });
});
