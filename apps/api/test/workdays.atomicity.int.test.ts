import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDb, type Database } from '../src/db/client';
import { addOffer, adjustOffer, listWorkdays } from '../src/modules/workdays/workday.usecases';
import { resetData } from './support/app';

// Simula que la auditoría no se puede guardar: el cambio de negocio no debe confirmarse.
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

// La alta de tiendas también audita, así que aquí se crea con SQL directo.
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
  const ctx = {
    userId: user.id,
    email: 'x@test.test',
    tenantId: tenant.id,
    tenantName: 'Original',
    role: 'owner' as const,
  };
  return { ctx, productId: product.id };
}

describe('transacción de jornada + auditoría', () => {
  it('si la auditoría falla, no se crea ni la jornada ni el producto del día', async () => {
    const { ctx, productId } = await seed();
    await expect(
      addOffer(db, ctx, '2026-10-15', { productId, quantity: '40' }, clock),
    ).rejects.toThrow(/auditoría/);

    expect((await listWorkdays(db, ctx, {})).total).toBe(0);
    const offers = await db.selectFrom('daily_offers').select('id').execute();
    expect(offers).toHaveLength(0);
  });

  it('si la auditoría falla, el aumento no se guarda', async () => {
    const { ctx, productId } = await seed();
    const workday = await db
      .insertInto('workdays')
      .values({
        tenant_id: ctx.tenantId,
        business_date: '2026-10-15',
        start_time: '08:00',
        end_time: '16:00',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const offer = await db
      .insertInto('daily_offers')
      .values({
        tenant_id: ctx.tenantId,
        workday_id: workday.id,
        product_id: productId,
        initial_quantity: '40',
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    await expect(
      adjustOffer(db, ctx, '2026-10-15', offer.id, { increment: '10', reason: 'Más' }, clock),
    ).rejects.toThrow(/auditoría/);

    const adjustments = await db.selectFrom('stock_adjustments').select('id').execute();
    expect(adjustments).toHaveLength(0);
  });
});
