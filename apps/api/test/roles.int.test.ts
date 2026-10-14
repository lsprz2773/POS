import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import fastify from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  can,
  type Dashboard,
  type PendingList,
  type Permission,
  type Product,
  type ProductList,
  type Report,
  type Sale,
  type SalesList,
} from '@pos/shared';
import { createDb, type Database } from '../src/db/client';
import { authPlugin } from '../src/modules/auth/plugin';
import {
  addSeller,
  createTwoTenants,
  makeApp,
  makeIdentity,
  resetData,
  type Session,
} from './support/app';

// Jueves 15 de octubre de 2026, 12:00 en la Ciudad de México.
const NOW = new Date('2026-10-15T18:00:00Z');

let db: Database;
let app: FastifyInstance;
const registered: { method: string; url: string; permission?: unknown; public?: unknown }[] = [];
let a: Session;
let b: Session;
let vera: Session; // vendedora de la tienda A
let raul: Session; // vendedor de la tienda A
let sofia: Session; // vendedora de la tienda B

beforeAll(async () => {
  db = createDb(process.env.TEST_DATABASE_URL!);
  app = makeApp(db, { clock: () => NOW });
  // Se anotan las rutas reales antes de que se registren, para comprobar que ninguna escapa de la matriz.
  app.addHook('onRoute', (route) => {
    const config = (route.config ?? {}) as { permission?: unknown; public?: unknown };
    for (const method of [route.method].flat()) {
      registered.push({
        method,
        url: route.url,
        permission: config.permission,
        public: config.public,
      });
    }
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.destroy();
});

beforeEach(async () => {
  await resetData(db);
  ({ a, b } = await createTwoTenants(app, db));
  vera = await addSeller(app, db, a.tenantId, 'vera@tienda-a.test');
  raul = await addSeller(app, db, a.tenantId, 'raul@tienda-a.test');
  sofia = await addSeller(app, db, b.tenantId, 'sofia@tienda-b.test');
});

const call = (
  s: Session | null,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: unknown,
  headers: Record<string, string> = {},
) =>
  app.inject({
    method,
    url,
    headers: { ...(s ? { cookie: s.cookie } : {}), ...headers },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });

async function stocked(s: Session, name = 'Tamal', quantity = '20') {
  const product = (
    await call(s, 'POST', '/api/products', { name, price: '25', cost: '14' })
  ).json<Product>();
  const offer = await call(s, 'POST', '/api/workdays/today/offers', {
    productId: product.id,
    quantity,
  });
  expect(offer.statusCode, offer.body).toBe(201);
  return product;
}

async function sell(s: Session, productId: string, pieces = 2, payments?: unknown) {
  const response = await call(
    s,
    'POST',
    '/api/sales',
    { items: [{ productId, quantity: String(pieces) }], ...(payments ? { payments } : {}) },
    { 'idempotency-key': randomUUID() },
  );
  expect(response.statusCode, response.body).toBe(201);
  return response.json<Sale>();
}

/** Cada ruta privada con el permiso que debe exigir. Una ruta nueva debe agregarse aquí. */
const MATRIX: { route: string; permission: Permission | 'any'; url: string; payload?: object }[] = [
  { route: 'GET /api/me', permission: 'any', url: '/api/me' },
  { route: 'GET /api/store', permission: 'store:read', url: '/api/store' },
  { route: 'PATCH /api/store', permission: 'store:update', url: '/api/store', payload: {} },
  { route: 'GET /api/products', permission: 'product:read', url: '/api/products' },
  { route: 'POST /api/products', permission: 'product:write', url: '/api/products', payload: {} },
  {
    route: 'GET /api/products/:id',
    permission: 'product:read',
    url: `/api/products/${randomUUID()}`,
  },
  {
    route: 'PATCH /api/products/:id',
    permission: 'product:write',
    url: `/api/products/${randomUUID()}`,
    payload: {},
  },
  { route: 'GET /api/workdays', permission: 'workday:read', url: '/api/workdays' },
  { route: 'GET /api/workdays/:date', permission: 'workday:read', url: '/api/workdays/today' },
  {
    route: 'PATCH /api/workdays/:date',
    permission: 'workday:hours',
    url: '/api/workdays/today',
    payload: {},
  },
  {
    route: 'POST /api/workdays/:date/offers',
    permission: 'workday:prepare',
    url: '/api/workdays/today/offers',
    payload: {},
  },
  {
    route: 'DELETE /api/workdays/:date/offers/:offerId',
    permission: 'workday:prepare',
    url: `/api/workdays/today/offers/${randomUUID()}`,
  },
  {
    route: 'POST /api/workdays/:date/offers/:offerId/adjustments',
    permission: 'workday:prepare',
    url: `/api/workdays/today/offers/${randomUUID()}/adjustments`,
    payload: {},
  },
  { route: 'POST /api/sales', permission: 'sale:create', url: '/api/sales', payload: {} },
  { route: 'GET /api/sales', permission: 'sale:read', url: '/api/sales' },
  { route: 'GET /api/sales/pending', permission: 'sale:read', url: '/api/sales/pending' },
  { route: 'GET /api/sales/:id', permission: 'sale:read', url: `/api/sales/${randomUUID()}` },
  {
    route: 'POST /api/sales/:id/payments',
    permission: 'payment:register',
    url: `/api/sales/${randomUUID()}/payments`,
    payload: {},
  },
  {
    route: 'POST /api/sales/:id/cancel',
    permission: 'sale:cancel',
    url: `/api/sales/${randomUUID()}/cancel`,
    payload: {},
  },
  {
    route: 'POST /api/payments/:id/void',
    permission: 'payment:void',
    url: `/api/payments/${randomUUID()}/void`,
    payload: {},
  },
  { route: 'GET /api/dashboard', permission: 'report:read', url: '/api/dashboard' },
  { route: 'GET /api/reports', permission: 'report:read', url: '/api/reports' },
];

describe('matriz de permisos rol por ruta', () => {
  it('toda ruta registrada está en la matriz con el permiso que declara (una nueva debe clasificarse)', () => {
    const privates = registered
      .filter((r) => !r.public && r.method !== 'HEAD')
      .map((r) => `${r.method} ${r.url}`)
      .sort();
    expect(privates).toEqual(MATRIX.map((m) => m.route).sort());
    for (const entry of MATRIX) {
      const found = registered.find((r) => `${r.method} ${r.url}` === entry.route);
      expect(found?.permission, entry.route).toBe(entry.permission);
    }
  });

  it('las rutas públicas son solo la salud y el inicio, la renovación y el cierre de sesión', () => {
    const publicRoutes = registered
      .filter((r) => r.public && r.method !== 'HEAD')
      .map((r) => `${r.method} ${r.url}`)
      .sort();
    expect(publicRoutes).toEqual([
      'GET /api/health',
      'GET /api/health/ready',
      'POST /api/auth/login',
      'POST /api/auth/logout',
      'POST /api/auth/refresh',
    ]);
  });

  it.each(MATRIX)('$route: el vendedor recibe 403 solo si no tiene el permiso', async (entry) => {
    const method = entry.route.split(' ')[0] as 'GET' | 'POST' | 'PATCH' | 'DELETE';
    const seller = await call(vera, method, entry.url, entry.payload, {
      'idempotency-key': randomUUID(),
    });
    const sellerAllowed = entry.permission === 'any' || can('seller', entry.permission);
    if (sellerAllowed) {
      expect(seller.statusCode, entry.route).not.toBe(403);
    } else {
      expect(seller.statusCode, entry.route).toBe(403);
      expect(seller.json()).toMatchObject({ code: 'forbidden' });
    }
    // El propietario puede todo: nunca 403.
    const owner = await call(a, method, entry.url, entry.payload, {
      'idempotency-key': randomUUID(),
    });
    expect(owner.statusCode, entry.route).not.toBe(403);
  });

  it('sin sesión todas las rutas privadas responden 401', async () => {
    for (const entry of MATRIX) {
      const method = entry.route.split(' ')[0] as 'GET' | 'POST' | 'PATCH' | 'DELETE';
      const response = await call(null, method, entry.url, entry.payload);
      expect(response.statusCode, entry.route).toBe(401);
    }
  });
});

describe('una ruta sin permiso declarado no arranca', () => {
  it('rechaza una ruta privada que no declara su permiso ni es pública', async () => {
    const server = fastify();
    void server.register(authPlugin, { db, identity: makeIdentity() });
    void server.register(async (api) => {
      api.get('/olvidada', async () => ({ ok: true }));
    });
    await expect(server.ready()).rejects.toThrow(/no declara su permiso/);
    await server.close();
  });

  it('acepta rutas con permiso y rutas públicas', async () => {
    const server = fastify();
    void server.register(authPlugin, { db, identity: makeIdentity() });
    void server.register(async (api) => {
      api.get('/a', { config: { permission: 'sale:read' } }, async () => ({ ok: true }));
      api.get('/b', { config: { public: true } }, async () => ({ ok: true }));
    });
    await expect(server.ready()).resolves.toBeDefined();
    await server.close();
  });
});

describe('el vendedor solo ve y opera lo que él registró', () => {
  it('historial, pendientes y detalle quedan acotados a sus ventas; las ajenas responden 404', async () => {
    const tamal = await stocked(a);
    const ownerSale = await sell(a, tamal.id, 1);
    const veraSale = await sell(vera, tamal.id, 2);
    const raulSale = await sell(raul, tamal.id, 3);

    const veraList = (await call(vera, 'GET', '/api/sales')).json<SalesList>();
    expect(veraList.items.map((s) => s.id)).toEqual([veraSale.id]);
    expect(veraList.total).toBe(1);

    const veraPending = (await call(vera, 'GET', '/api/sales/pending')).json<PendingList>();
    expect(veraPending.items.map((s) => s.id)).toEqual([veraSale.id]);
    expect(veraPending.totalBalance).toBe('50.00');

    // El propietario ve las de todos.
    const ownerList = (await call(a, 'GET', '/api/sales')).json<SalesList>();
    expect(ownerList.total).toBe(3);
    expect((await call(a, 'GET', '/api/sales/pending')).json<PendingList>().totalBalance).toBe(
      '150.00',
    );

    for (const foreign of [ownerSale, raulSale]) {
      const response = await call(vera, 'GET', `/api/sales/${foreign.id}`);
      expect(response.statusCode).toBe(404);
    }
    expect((await call(vera, 'GET', `/api/sales/${veraSale.id}`)).statusCode).toBe(200);
  });

  it('cobra, anula y cancela solo sus ventas; en una ajena todo responde 404 y nada cambia', async () => {
    const tamal = await stocked(a);
    const raulSale = await sell(raul, tamal.id, 2);
    const veraSale = await sell(vera, tamal.id, 2);

    const pay = { lines: [{ method: 'cash', amount: '10.00' }] };
    const key = { 'idempotency-key': randomUUID() };
    expect(
      (await call(vera, 'POST', `/api/sales/${raulSale.id}/payments`, pay, key)).statusCode,
    ).toBe(404);
    expect(
      (await call(vera, 'POST', `/api/sales/${raulSale.id}/cancel`, { reason: 'No es mía' }))
        .statusCode,
    ).toBe(404);
    const stillRaul = (await call(raul, 'GET', `/api/sales/${raulSale.id}`)).json<Sale>();
    expect(stillRaul).toMatchObject({ status: 'active', paid: '0.00' });

    // Un pago de otra persona tampoco se puede anular.
    const paid = (
      await call(raul, 'POST', `/api/sales/${raulSale.id}/payments`, pay, {
        'idempotency-key': randomUUID(),
      })
    ).json<Sale>();
    const paymentId = paid.payments[0]!.id;
    expect(
      (await call(vera, 'POST', `/api/payments/${paymentId}/void`, { reason: 'No es mío' }))
        .statusCode,
    ).toBe(404);

    // Lo suyo sí: cobra, anula su pago y cancela su venta (el inventario vuelve a su disponibilidad).
    const own = (
      await call(vera, 'POST', `/api/sales/${veraSale.id}/payments`, pay, {
        'idempotency-key': randomUUID(),
      })
    ).json<Sale>();
    expect(own.paid).toBe('10.00');
    const voided = await call(vera, 'POST', `/api/payments/${own.payments[0]!.id}/void`, {
      reason: 'Me equivoqué',
    });
    expect(voided.statusCode, voided.body).toBe(200);
    const cancelled = await call(vera, 'POST', `/api/sales/${veraSale.id}/cancel`, {
      reason: 'El cliente se arrepintió',
    });
    expect(cancelled.statusCode, cancelled.body).toBe(200);
    expect(cancelled.json<Sale>().status).toBe('cancelled');
  });

  it('el dashboard y el reporte del vendedor son los mismos cálculos acotados a sus ventas', async () => {
    const tamal = await stocked(a);
    await sell(a, tamal.id, 1, [{ method: 'cash', amount: '25.00' }]);
    await sell(vera, tamal.id, 2, [{ method: 'transfer', amount: '50.00' }]);
    await sell(raul, tamal.id, 4);

    const veraDash = (await call(vera, 'GET', '/api/dashboard')).json<Dashboard>();
    expect(veraDash).toMatchObject({
      salesTotal: '50.00',
      salesCount: 1,
      collected: '50.00',
      pendingCount: 0,
      estimatedGrossProfit: '22.00',
    });
    const ownerDash = (await call(a, 'GET', '/api/dashboard')).json<Dashboard>();
    expect(ownerDash).toMatchObject({ salesTotal: '175.00', salesCount: 3, pendingCount: 1 });

    const veraReport = (
      await call(vera, 'GET', '/api/reports?period=day&date=2026-10-15')
    ).json<Report>();
    expect(veraReport).toMatchObject({
      salesTotal: '50.00',
      salesCount: 1,
      unitsSold: '2',
      costOfGoodsSold: '28.00',
      grossProfit: '22.00',
      collected: '50.00',
      pending: '0.00',
    });
    expect(veraReport.topProducts).toEqual([
      expect.objectContaining({ productId: tamal.id, units: '2', amount: '50.00' }),
    ]);
    const ownerReport = (
      await call(a, 'GET', '/api/reports?period=day&date=2026-10-15')
    ).json<Report>();
    expect(ownerReport).toMatchObject({ salesTotal: '175.00', salesCount: 3, unitsSold: '7' });
  });

  it('un vendedor ve los productos activos con precio y costo, pero no los inactivos', async () => {
    const tamal = await stocked(a, 'Tamal');
    const atole = await stocked(a, 'Atole');
    const current = (await call(a, 'GET', `/api/products/${atole.id}`)).json<Product>();
    await call(a, 'PATCH', `/api/products/${atole.id}`, {
      active: false,
      version: current.version,
    });

    const list = (await call(vera, 'GET', '/api/products?status=all')).json<ProductList>();
    expect(list.items.map((p) => p.name)).toEqual(['Tamal']);
    expect(list.items[0]).toMatchObject({ price: '25.00', cost: '14.00' });
    expect((await call(vera, 'GET', `/api/products/${tamal.id}`)).statusCode).toBe(200);
    expect((await call(vera, 'GET', `/api/products/${atole.id}`)).statusCode).toBe(404);
  });

  it('aislamiento: un vendedor de la tienda B no ve nada de la tienda A', async () => {
    const tamal = await stocked(a);
    const sale = await sell(a, tamal.id, 1);
    expect((await call(sofia, 'GET', `/api/sales/${sale.id}`)).statusCode).toBe(404);
    expect((await call(sofia, 'GET', '/api/sales')).json<SalesList>().total).toBe(0);
    expect((await call(sofia, 'GET', `/api/products/${tamal.id}`)).statusCode).toBe(404);
    expect((await call(sofia, 'GET', '/api/products')).json<ProductList>().total).toBe(0);
  });
});

describe('baja de un vendedor', () => {
  it('una cuenta dada de baja recibe 403 membership_disabled en su siguiente petición', async () => {
    expect((await call(vera, 'GET', '/api/me')).statusCode).toBe(200);
    await db
      .updateTable('memberships')
      .set({ status: 'disabled' })
      .where('user_id', '=', vera.userId)
      .execute();
    const response = await call(vera, 'GET', '/api/me');
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'membership_disabled' });
    // Su token sigue vigente, pero ninguna ruta de negocio le responde.
    expect((await call(vera, 'GET', '/api/sales')).statusCode).toBe(403);
  });
});

describe('restricciones de la base', () => {
  it('una tienda no puede tener dos propietarios', async () => {
    await expect(
      db
        .updateTable('memberships')
        .set({ role: 'owner' })
        .where('user_id', '=', vera.userId)
        .execute(),
    ).rejects.toThrow(/memberships_one_owner_idx/);
  });

  it('solo existen los roles propietario y vendedor', async () => {
    await expect(
      db
        .updateTable('memberships')
        .set({ role: 'cashier' })
        .where('user_id', '=', vera.userId)
        .execute(),
    ).rejects.toThrow(/memberships_role_check/);
  });
});
