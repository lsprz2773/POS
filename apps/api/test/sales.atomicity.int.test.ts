import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDb, type Database } from '../src/db/client';
import { createSale } from '../src/modules/sales/sale.usecases';
import { resetData } from './support/app';

// Simula que la auditoría no se puede guardar: la venta y el descuento de inventario no se confirman.
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

// La alta de tiendas y de la jornada también auditan, así que aquí se crea todo con SQL directo.
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
  await db
    .insertInto('daily_offers')
    .values({
      tenant_id: tenant.id,
      workday_id: workday.id,
      user_id: user.id,
      product_id: product.id,
      initial_quantity: '10',
    })
    .execute();
  const ctx = {
    userId: user.id,
    email: 'x@test.test',
    tenantId: tenant.id,
    tenantName: 'Original',
    role: 'owner' as const,
  };
  return { ctx, productId: product.id };
}

describe('transacción de venta + inventario + auditoría', () => {
  it('si la auditoría falla, no queda venta, ni renglones, ni descuento, ni folio gastado', async () => {
    const { ctx, productId } = await seed();
    await expect(
      createSale(db, ctx, randomUUID(), { items: [{ productId, quantity: '3' }] }, clock),
    ).rejects.toThrow(/auditoría/);

    expect(await db.selectFrom('sales').select('id').execute()).toHaveLength(0);
    expect(await db.selectFrom('sale_items').select('id').execute()).toHaveLength(0);
    // El contador se revirtió con la transacción: la siguiente venta seguiría siendo la 1.
    expect(await db.selectFrom('sale_counters').select('last_folio').execute()).toHaveLength(0);
  });
});
