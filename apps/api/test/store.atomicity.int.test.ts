import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDb, type Database } from '../src/db/client';
import { getStore, updateStore } from '../src/modules/store/store.usecases';
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
  return { tenantId: tenant.id, userId: user.id };
}

describe('transacción de cambio + auditoría', () => {
  it('si la auditoría falla, el cambio se revierte', async () => {
    const { tenantId, userId } = await insertTenant();
    const ctx = {
      userId,
      email: 'x@test.test',
      tenantId,
      tenantName: 'Original',
      role: 'owner' as const,
    };

    await expect(updateStore(db, ctx, { name: 'Nuevo nombre' })).rejects.toThrow(/auditoría/);
    expect((await getStore(db, ctx)).name).toBe('Original');
  });
});
