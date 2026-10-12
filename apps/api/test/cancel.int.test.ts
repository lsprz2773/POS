import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PendingList, Product, Sale, Workday } from '@pos/shared';
import { createDb, type Database } from '../src/db/client';
import { createTwoTenants, makeApp, resetData, type Session } from './support/app';

// Jueves 15 de octubre de 2026, 12:00 en la Ciudad de México.
const NOW = new Date('2026-10-15T18:00:00Z');
const NEXT_DAY = new Date('2026-10-16T18:00:00Z');

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

type Method = 'GET' | 'POST';

const request = (
  server: FastifyInstance,
  s: Session | null,
  method: Method,
  url: string,
  payload?: unknown,
  headers: Record<string, string> = {},
) =>
  server.inject({
    method,
    url,
    headers: { ...(s ? { cookie: s.cookie } : {}), ...headers },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });
const call = (s: Session | null, method: Method, url: string, payload?: unknown) =>
  request(app, s, method, url, payload);

const cancel = (
  s: Session | null,
  saleId: string,
  reason: unknown = 'El cliente se arrepintió',
  server: FastifyInstance = app,
) => request(server, s, 'POST', `/api/sales/${saleId}/cancel`, { reason });

async function stocked(s: Session, name: string, quantity = '10') {
  const created = await call(s, 'POST', '/api/products', { name, price: '25', cost: '14' });
  const product = created.json<Product>();
  const offer = await call(s, 'POST', '/api/workdays/today/offers', {
    productId: product.id,
    quantity,
  });
  expect(offer.statusCode, offer.body).toBe(201);
  return product;
}

async function sale(s: Session, productId: string, pieces = 2, payments?: unknown) {
  const response = await request(
    app,
    s,
    'POST',
    '/api/sales',
    { items: [{ productId, quantity: String(pieces) }], ...(payments ? { payments } : {}) },
    { 'idempotency-key': randomUUID() },
  );
  expect(response.statusCode, response.body).toBe(201);
  return response.json<Sale>();
}

const offerOf = async (s: Session, productId: string, server: FastifyInstance = app) => {
  const day = (await request(server, s, 'GET', '/api/workdays/2026-10-15')).json<Workday>();
  return day.offers.find((offer) => offer.productId === productId)!;
};

const audit = (s: Session) =>
  db
    .selectFrom('audit_events')
    .selectAll()
    .where('tenant_id', '=', s.tenantId)
    .where('entity', '=', 'sale')
    .where('action', '=', 'cancel')
    .execute();

describe('cancelar una venta de hoy', () => {
  it('conserva la venta, guarda el motivo y devuelve las piezas al inventario', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 4);
    expect((await offerOf(a, tamal.id)).availableQuantity).toBe('6');

    const response = await cancel(a, created.id, '  Se equivocó de pedido  ');
    expect(response.statusCode, response.body).toBe(200);
    const view = response.json<Sale>();
    expect(view).toMatchObject({
      id: created.id,
      folio: created.folio,
      status: 'cancelled',
      paymentStatus: 'cancelled',
      total: '100.00',
      balance: '0.00',
      cancellation: {
        reason: 'Se equivocó de pedido',
        inventoryRestored: true,
        refundDue: '0.00',
      },
    });
    expect(view.items).toHaveLength(1);
    expect(view.items[0]).toMatchObject({
      productName: 'Tamal',
      quantity: '4',
      subtotal: '100.00',
    });
    expect(await offerOf(a, tamal.id)).toMatchObject({
      soldQuantity: '0',
      availableQuantity: '10',
    });

    // Se puede volver a vender lo liberado.
    await sale(a, tamal.id, 10);
    expect((await offerOf(a, tamal.id)).availableQuantity).toBe('0');
  });

  it('registra quién cancela y por qué en una tabla que no se edita ni se borra', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id);
    await cancel(a, created.id, 'Duplicada');

    const rows = await db.selectFrom('sale_cancellations').selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenant_id: a.tenantId,
      sale_id: created.id,
      reason: 'Duplicada',
      inventory_restored: true,
      cancelled_by: a.userId,
    });
    await expect(
      db.updateTable('sale_cancellations').set({ reason: 'otro' }).execute(),
    ).rejects.toThrow(/no se edita/);
    await expect(db.deleteFrom('sale_cancellations').execute()).rejects.toThrow(/no se edita/);
    await expect(
      db.updateTable('sales').set({ status: 'active' }).where('id', '=', created.id).execute(),
    ).rejects.toThrow(/no se reactiva/);
    await expect(db.deleteFrom('sales').where('id', '=', created.id).execute()).rejects.toThrow(
      /no se borra/,
    );
  });

  it('audita la cancelación', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id);
    await cancel(a, created.id, 'Duplicada');
    const events = await audit(a);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ entity_id: created.id, actor_user_id: a.userId });
    expect(events[0]!.data).toMatchObject({
      folio: created.folio,
      reason: 'Duplicada',
      inventoryRestored: true,
    });
  });

  it('una venta pendiente cancelada deja de aparecer en pendientes', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 2);
    const before = (await call(a, 'GET', '/api/sales/pending')).json<PendingList>();
    expect(before.total).toBe(1);
    await cancel(a, created.id);
    const after = (await call(a, 'GET', '/api/sales/pending')).json<PendingList>();
    expect(after).toMatchObject({ total: 0, totalBalance: '0.00' });
  });
});

describe('pagos de una venta cancelada', () => {
  it('se conservan y se muestran como por devolver fuera del sistema', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 2, [
      { method: 'cash', amount: '30' },
      { method: 'transfer', amount: '20' },
    ]);
    expect(created.paymentStatus).toBe('paid');

    const view = (await cancel(a, created.id)).json<Sale>();
    expect(view.cancellation).toMatchObject({ refundDue: '50.00' });
    expect(view.paid).toBe('50.00');
    expect(view.payments).toHaveLength(2);
    expect(view.payments.every((payment) => payment.status === 'valid')).toBe(true);
  });

  it('un pago anulado antes no cuenta como por devolver', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 2, [
      { method: 'cash', amount: '30' },
      { method: 'transfer', amount: '20' },
    ]);
    const transfer = created.payments.find((payment) => payment.method === 'transfer')!;
    await call(a, 'POST', `/api/payments/${transfer.id}/void`, { reason: 'Error' });
    const view = (await cancel(a, created.id)).json<Sale>();
    expect(view.cancellation!.refundDue).toBe('30.00');
  });

  it('no admite pagos nuevos ni anular los existentes', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 2, [{ method: 'cash', amount: '20' }]);
    await cancel(a, created.id);

    const payment = await request(
      app,
      a,
      'POST',
      `/api/sales/${created.id}/payments`,
      { lines: [{ method: 'cash', amount: '5' }] },
      { 'idempotency-key': randomUUID() },
    );
    expect(payment.statusCode).toBe(409);
    const voided = await call(a, 'POST', `/api/payments/${created.payments[0]!.id}/void`, {
      reason: 'x',
    });
    expect(voided.statusCode).toBe(409);
    expect((await call(a, 'GET', `/api/sales/${created.id}`)).json<Sale>().paid).toBe('20.00');
  });
});

describe('cancelar una venta de un día anterior', () => {
  it('no restituye el inventario y el día conserva su historial', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 4);

    const tomorrow = makeApp(db, { clock: () => NEXT_DAY });
    await tomorrow.ready();
    const response = await cancel(a, created.id, 'Devolución del cliente', tomorrow);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json<Sale>().cancellation).toMatchObject({ inventoryRestored: false });

    expect(await offerOf(a, tamal.id, tomorrow)).toMatchObject({
      soldQuantity: '4',
      availableQuantity: '6',
    });
    const list = (await request(tomorrow, a, 'GET', '/api/workdays')).json<{
      items: { date: string; soldQuantity: string }[];
    }>();
    expect(list.items.find((day) => day.date === '2026-10-15')!.soldQuantity).toBe('4');
    await tomorrow.close();
  });
});

describe('validaciones', () => {
  it('exige un motivo y rechaza campos desconocidos', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id);
    const bodies = [
      {},
      { reason: '' },
      { reason: '   ' },
      { reason: 'x'.repeat(201) },
      { reason: 5 },
    ];
    for (const body of bodies) {
      const response = await call(a, 'POST', `/api/sales/${created.id}/cancel`, body);
      expect(response.statusCode, JSON.stringify(body).slice(0, 30)).toBe(400);
      expect(response.json().code).toBe('validation_error');
    }
    const extra = await call(a, 'POST', `/api/sales/${created.id}/cancel`, {
      reason: 'ok',
      status: 'active',
      tenantId: b.tenantId,
    });
    expect(extra.statusCode).toBe(400);
    expect((await call(a, 'GET', `/api/sales/${created.id}`)).json<Sale>().status).toBe('active');
  });

  it('cancelar dos veces da conflicto y no repite nada', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 4);
    expect((await cancel(a, created.id)).statusCode).toBe(200);
    const again = await cancel(a, created.id, 'Otra vez');
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toMatch(/ya estaba cancelada/);
    expect(await db.selectFrom('sale_cancellations').select('id').execute()).toHaveLength(1);
    expect((await offerOf(a, tamal.id)).availableQuantity).toBe('10');
  });

  it('una venta inexistente o con id inválido es 404, y sin sesión 401', async () => {
    expect((await cancel(a, randomUUID())).statusCode).toBe(404);
    expect((await cancel(a, 'no-es-uuid')).statusCode).toBe(404);
    expect((await cancel(null, randomUUID())).statusCode).toBe(401);
  });
});

describe('aislamiento entre tiendas', () => {
  it('una tienda no puede cancelar ni ver cancelada la venta de otra', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id);
    const intruder = await cancel(b, created.id);
    expect(intruder.statusCode).toBe(404);
    expect((await call(a, 'GET', `/api/sales/${created.id}`)).json<Sale>().status).toBe('active');
    expect(await db.selectFrom('sale_cancellations').select('id').execute()).toHaveLength(0);
  });

  it('cancelar en una tienda no mueve el inventario de la otra', async () => {
    const tamalA = await stocked(a, 'Tamal');
    const tamalB = await stocked(b, 'Tamal');
    const saleA = await sale(a, tamalA.id, 3);
    await sale(b, tamalB.id, 5);
    await cancel(a, saleA.id);
    expect((await offerOf(a, tamalA.id)).availableQuantity).toBe('10');
    expect((await offerOf(b, tamalB.id)).availableQuantity).toBe('5');
  });
});

describe('concurrencia', () => {
  it('dos cancelaciones simultáneas: una gana y la otra recibe conflicto', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 4);
    const results = await Promise.all([cancel(a, created.id, 'A'), cancel(a, created.id, 'B')]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(await db.selectFrom('sale_cancellations').select('id').execute()).toHaveLength(1);
    expect((await offerOf(a, tamal.id)).availableQuantity).toBe('10');
  });

  it('un pago y una cancelación simultáneos no dejan un cobro sobre una venta vigente', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 2);
    const [paid, cancelled] = await Promise.all([
      request(
        app,
        a,
        'POST',
        `/api/sales/${created.id}/payments`,
        { lines: [{ method: 'cash', amount: '50' }] },
        { 'idempotency-key': randomUUID() },
      ),
      cancel(a, created.id),
    ]);
    expect(cancelled.statusCode).toBe(200);
    const view = (await call(a, 'GET', `/api/sales/${created.id}`)).json<Sale>();
    expect(view.status).toBe('cancelled');
    // Si el pago entró antes, queda como por devolver; si no, se rechazó.
    expect([201, 409]).toContain(paid.statusCode);
    expect(view.cancellation!.refundDue).toBe(paid.statusCode === 201 ? '50.00' : '0.00');
  });
});
