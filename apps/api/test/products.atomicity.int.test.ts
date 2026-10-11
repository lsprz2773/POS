import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDb, type Database } from '../src/db/client';
import {
  createProduct,
  listProducts,
  updateProduct,
} from '../src/modules/products/product.usecases';
import { resetData } from './support/app';

// Simula que la auditoría no se puede guardar: el cambio de negocio no debe confirmarse.
vi.mock('../src/modules/audit/audit', () => ({
  recordAudit: vi.fn().mockRejectedValue(new Error('auditoría no disponible')),
}));

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
async function insertTenant() {
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
  return {
    userId: user.id,
    email: 'x@test.test',
    tenantId: tenant.id,
    tenantName: 'Original',
    role: 'owner' as const,
  };
}

describe('transacción de producto + auditoría', () => {
  it('si la auditoría falla, el producto no se crea', async () => {
    const ctx = await insertTenant();
    await expect(
      createProduct(db, ctx, { name: 'Tamal', price: '25', cost: '14' }),
    ).rejects.toThrow(/auditoría/);
    expect((await listProducts(db, ctx, { status: 'all' })).total).toBe(0);
  });

  it('si la auditoría falla, la edición se revierte', async () => {
    const ctx = await insertTenant();
    const inserted = await db
      .insertInto('products')
      .values({ tenant_id: ctx.tenantId, name: 'Tamal', price: '25.00', cost: '14.00' })
      .returning('id')
      .executeTakeFirstOrThrow();

    await expect(
      updateProduct(db, ctx, inserted.id, { version: 1, price: '99', active: false }),
    ).rejects.toThrow(/auditoría/);

    const row = await db
      .selectFrom('products')
      .selectAll()
      .where('id', '=', inserted.id)
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({ price: '25.00', active: true, version: 1 });
  });
});
