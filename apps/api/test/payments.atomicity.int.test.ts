import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDb, type Database } from '../src/db/client';
import { registerPayments, voidPayment } from '../src/modules/sales/payment.usecases';
import { resetData } from './support/app';

// Simula que la auditoría no se puede guardar: el pago, su anulación y la liquidación no se confirman.
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

// Todo se crea con SQL directo porque la alta de tiendas, jornadas y ventas también audita.
async function seed() {
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
  await db
    .insertInto('memberships')
    .values({ tenant_id: tenant.id, user_id: user.id, role: 'owner' })
    .execute();
  const product = await db
    .insertInto('products')
    .values({ tenant_id: tenant.id, name: 'Tamal', price: '25.00', cost: '14.00' })
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
  const offer = await db
    .insertInto('daily_offers')
    .values({
      tenant_id: tenant.id,
      workday_id: workday.id,
      user_id: user.id,
      product_id: product.id,
      initial_quantity: '10',
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
      total: '50.00',
      created_by: user.id,
      idempotency_key: randomUUID(),
      request_hash: 'b'.repeat(64),
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await db
    .insertInto('sale_items')
    .values({
      tenant_id: tenant.id,
      sale_id: sale.id,
      position: 1,
      daily_offer_id: offer.id,
      product_id: product.id,
      product_name: 'Tamal',
      quantity: '2',
      unit_price: '25.00',
      unit_cost: '14.00',
      subtotal: '50.00',
    })
    .execute();
  const ctx = {
    userId: user.id,
    email: 'x@test.test',
    tenantId: tenant.id,
    tenantName: 'Original',
    role: 'owner' as const,
  };
  return { ctx, saleId: sale.id };
}

describe('transacción de pago + auditoría', () => {
  it('si la auditoría falla, el pago no se guarda y la venta no queda liquidada', async () => {
    const { ctx, saleId } = await seed();
    await expect(
      registerPayments(
        db,
        ctx,
        saleId,
        randomUUID(),
        { lines: [{ method: 'cash', amount: '50' }] },
        clock,
      ),
    ).rejects.toThrow(/auditoría/);

    expect(await db.selectFrom('payments').select('id').execute()).toHaveLength(0);
    const sale = await db
      .selectFrom('sales')
      .select('settled_at')
      .where('id', '=', saleId)
      .executeTakeFirstOrThrow();
    expect(sale.settled_at).toBeNull();
  });

  it('si la auditoría falla, el pago no se anula y la venta sigue liquidada', async () => {
    const { ctx, saleId } = await seed();
    const payment = await db
      .insertInto('payments')
      .values({
        tenant_id: ctx.tenantId,
        sale_id: saleId,
        operation_id: randomUUID(),
        method: 'cash',
        amount: '50.00',
        created_by: ctx.userId,
        idempotency_key: randomUUID(),
        request_hash: 'c'.repeat(64),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const settledAt = new Date('2026-10-15T17:00:00Z');
    await db.updateTable('sales').set({ settled_at: settledAt }).where('id', '=', saleId).execute();

    await expect(voidPayment(db, ctx, payment.id, { reason: 'Error' }, clock)).rejects.toThrow(
      /auditoría/,
    );

    const row = await db
      .selectFrom('payments')
      .select(['status', 'void_reason'])
      .where('id', '=', payment.id)
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({ status: 'valid', void_reason: null });
    const sale = await db
      .selectFrom('sales')
      .select('settled_at')
      .where('id', '=', saleId)
      .executeTakeFirstOrThrow();
    expect(sale.settled_at?.toISOString()).toBe(settledAt.toISOString());
  });
});
