import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type Dashboard, type Product, type Report, type Sale, type SalesList } from '@pos/shared';
import { createDb, type Database } from '../src/db/client';
import { createTwoTenants, makeApp, resetData, type Session } from './support/app';

// Jueves 15 de octubre de 2026, 12:00 en la Ciudad de México (UTC−6).
const NOW = new Date('2026-10-15T18:00:00Z');
const YESTERDAY = new Date('2026-10-14T18:00:00Z');

let db: Database;
let app: FastifyInstance;
let yesterday: FastifyInstance;
let a: Session;
let b: Session;
const extraApps: FastifyInstance[] = [];

beforeAll(async () => {
  db = createDb(process.env.TEST_DATABASE_URL!);
  app = makeApp(db, { clock: () => NOW });
  yesterday = makeApp(db, { clock: () => YESTERDAY });
  await Promise.all([app.ready(), yesterday.ready()]);
});

afterAll(async () => {
  await Promise.all([app.close(), yesterday.close(), ...extraApps.map((x) => x.close())]);
  await db.destroy();
});

beforeEach(async () => {
  await resetData(db);
  ({ a, b } = await createTwoTenants(app, db));
});

type Line = { method: 'cash' | 'transfer'; amount: string };

const send = (
  server: FastifyInstance,
  s: Session | null,
  method: 'GET' | 'POST',
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

const get = (s: Session | null, url: string, server = app) => send(server, s, 'GET', url);

async function product(s: Session, name: string, price: string, cost: string) {
  const response = await send(app, s, 'POST', '/api/products', { name, price, cost });
  expect(response.statusCode, response.body).toBe(201);
  return response.json<Product>();
}

async function offer(server: FastifyInstance, s: Session, productId: string, quantity = '50') {
  const response = await send(server, s, 'POST', '/api/workdays/today/offers', {
    productId,
    quantity,
  });
  expect(response.statusCode, response.body).toBe(201);
}

async function sell(
  server: FastifyInstance,
  s: Session,
  items: { productId: string; quantity: string }[],
  extra: Record<string, unknown> = {},
) {
  const response = await send(
    server,
    s,
    'POST',
    '/api/sales',
    { items, ...extra },
    { 'idempotency-key': randomUUID() },
  );
  expect(response.statusCode, response.body).toBe(201);
  return response.json<Sale>();
}

async function pay(server: FastifyInstance, s: Session, saleId: string, lines: Line[]) {
  const response = await send(
    server,
    s,
    'POST',
    `/api/sales/${saleId}/payments`,
    { lines },
    { 'idempotency-key': randomUUID() },
  );
  expect(response.statusCode, response.body).toBe(201);
}

const at = (iso: string) => {
  const server = makeApp(db, { clock: () => new Date(iso) });
  extraApps.push(server);
  return server;
};

/**
 * Datos de la tienda A (tamal $25 con costo $14, atole $18 con costo $6.50):
 *  - 14 oct: V-0001, 3 tamales = $75, sin pagos; se cobra completo el 15 oct.
 *  - 15 oct: V-0002 2 tamales = $50, pagada en efectivo.
 *            V-0003 1 tamal + 2 atoles = $61, abona $20 por transferencia (falta $41).
 *            V-0004 4 tamales = $100 con $30 en efectivo, luego cancelada.
 */
async function scenario() {
  const tamal = await product(a, 'Tamal', '25.00', '14.00');
  const atole = await product(a, 'Atole', '18.00', '6.50');
  await offer(yesterday, a, tamal.id);
  const past = await sell(yesterday, a, [{ productId: tamal.id, quantity: '3' }]);

  await offer(app, a, tamal.id);
  await offer(app, a, atole.id);
  await pay(app, a, past.id, [{ method: 'cash', amount: '75' }]);
  const s1 = await sell(app, a, [{ productId: tamal.id, quantity: '2' }], {
    payments: [{ method: 'cash', amount: '50' }],
  });
  const s2 = await sell(
    app,
    a,
    [
      { productId: tamal.id, quantity: '1' },
      { productId: atole.id, quantity: '2' },
    ],
    { customerReference: 'Ana López', payments: [{ method: 'transfer', amount: '20' }] },
  );
  const s3 = await sell(app, a, [{ productId: tamal.id, quantity: '4' }], {
    payments: [{ method: 'cash', amount: '30' }],
  });
  const cancelled = await send(app, a, 'POST', `/api/sales/${s3.id}/cancel`, { reason: 'Error' });
  expect(cancelled.statusCode, cancelled.body).toBe(200);
  return { tamal, atole, past, s1, s2, s3 };
}

describe('reporte del día', () => {
  it('cuadra con las definiciones de dominio.md, incluido un pago de una venta anterior', async () => {
    const { tamal, atole } = await scenario();
    const response = await get(a, '/api/reports?period=day&date=2026-10-15');
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json<Report>()).toEqual({
      from: '2026-10-15',
      to: '2026-10-15',
      salesTotal: '111.00',
      salesCount: 2,
      averageTicket: '55.50',
      unitsSold: '5',
      // 50 + 75 en efectivo (este último de una venta del 14) y 20 por transferencia.
      collected: '145.00',
      collectedByMethod: { cash: '125.00', transfer: '20.00' },
      pending: '41.00',
      costOfGoodsSold: '55.00',
      grossProfit: '56.00',
      isGrossLoss: false,
      grossMargin: '50.45',
      topProducts: [
        { productId: tamal.id, name: 'Tamal', units: '3', amount: '75.00' },
        { productId: atole.id, name: 'Atole', units: '2', amount: '36.00' },
      ],
      // La venta cancelada sale de todo lo anterior y se muestra aparte.
      cancelled: { count: 1, total: '100.00', refundDue: '30.00' },
    });
  });

  it('el día anterior no incluye el cobro que se recibió hoy', async () => {
    await scenario();
    const report = (await get(a, '/api/reports?date=2026-10-14')).json<Report>();
    expect(report).toMatchObject({
      salesTotal: '75.00',
      salesCount: 1,
      collected: '0.00',
      pending: '0.00',
      costOfGoodsSold: '42.00',
      grossProfit: '33.00',
      cancelled: { count: 0, total: '0.00', refundDue: '0.00' },
    });
  });

  it('usa hoy por omisión', async () => {
    await scenario();
    const report = (await get(a, '/api/reports')).json<Report>();
    expect(report).toMatchObject({ from: '2026-10-15', to: '2026-10-15', salesCount: 2 });
  });
});

describe('semana, mes y rango', () => {
  it('la semana va de lunes a domingo y suma todos sus días', async () => {
    await scenario();
    const report = (await get(a, '/api/reports?period=week&date=2026-10-15')).json<Report>();
    expect(report).toMatchObject({
      from: '2026-10-12',
      to: '2026-10-18',
      salesTotal: '186.00',
      salesCount: 3,
      averageTicket: '62.00',
      unitsSold: '8',
      collected: '145.00',
      pending: '41.00',
      grossProfit: '89.00',
    });
    expect(report.topProducts[0]).toMatchObject({ name: 'Tamal', units: '6', amount: '150.00' });
  });

  it('el mes y el rango personalizado dan lo mismo que la semana cuando abarcan los mismos días', async () => {
    await scenario();
    const month = (await get(a, '/api/reports?period=month&date=2026-10-20')).json<Report>();
    expect(month).toMatchObject({ from: '2026-10-01', to: '2026-10-31', salesTotal: '186.00' });
    const range = (await get(a, '/api/reports?from=2026-10-14&to=2026-10-15')).json<Report>();
    expect(range).toMatchObject({ salesTotal: '186.00', salesCount: 3, collected: '145.00' });
  });

  it('un periodo sin datos devuelve ceros y margen nulo', async () => {
    await scenario();
    const report = (await get(a, '/api/reports?from=2026-11-01&to=2026-11-07')).json<Report>();
    expect(report).toEqual({
      from: '2026-11-01',
      to: '2026-11-07',
      salesTotal: '0.00',
      salesCount: 0,
      averageTicket: '0.00',
      unitsSold: '0',
      collected: '0.00',
      collectedByMethod: { cash: '0.00', transfer: '0.00' },
      pending: '0.00',
      costOfGoodsSold: '0.00',
      grossProfit: '0.00',
      isGrossLoss: false,
      grossMargin: null,
      topProducts: [],
      cancelled: { count: 0, total: '0.00', refundDue: '0.00' },
    });
  });
});

describe('utilidad bruta', () => {
  it('un resultado negativo es pérdida bruta y usa el costo congelado, no el precio actual', async () => {
    const barato = await product(a, 'Promoción', '10.00', '15.00');
    await offer(app, a, barato.id);
    await sell(app, a, [{ productId: barato.id, quantity: '2' }]);
    // Cambiar el catálogo después no altera lo ya vendido (RF-105).
    await db
      .updateTable('products')
      .set({ price: '99.00', cost: '1.00' })
      .where('id', '=', barato.id)
      .execute();

    const report = (await get(a, '/api/reports')).json<Report>();
    expect(report).toMatchObject({
      salesTotal: '20.00',
      costOfGoodsSold: '30.00',
      grossProfit: '-10.00',
      isGrossLoss: true,
      grossMargin: '-50.00',
    });
  });

  it('el costo de un renglón con fracciones se redondea a centavos con la mitad hacia arriba', async () => {
    const { id } = await product(a, 'Queso', '100.00', '33.33');
    await db.updateTable('products').set({ allows_fractions: true }).where('id', '=', id).execute();
    await offer(app, a, id, '10');
    await sell(app, a, [{ productId: id, quantity: '0.5' }]);
    const report = (await get(a, '/api/reports')).json<Report>();
    // 0.5 × 33.33 = 16.665 → 16.67
    expect(report).toMatchObject({
      unitsSold: '0.5',
      salesTotal: '50.00',
      costOfGoodsSold: '16.67',
      grossProfit: '33.33',
    });
  });
});

describe('zona horaria de la tienda', () => {
  it('un pago a las 23:30 locales cuenta en ese día y uno a las 00:30 en el siguiente', async () => {
    const tamal = await product(a, 'Tamal', '25.00', '14.00');
    await offer(app, a, tamal.id);
    const created = await sell(app, a, [{ productId: tamal.id, quantity: '4' }]);
    await pay(at('2026-10-16T05:30:00Z'), a, created.id, [{ method: 'cash', amount: '10' }]); // 23:30 del 15
    await pay(at('2026-10-16T06:30:00Z'), a, created.id, [{ method: 'cash', amount: '20' }]); // 00:30 del 16

    expect((await get(a, '/api/reports?date=2026-10-15')).json<Report>().collected).toBe('10.00');
    expect((await get(a, '/api/reports?date=2026-10-16')).json<Report>().collected).toBe('20.00');
  });
});

describe('validaciones', () => {
  it.each([
    ['rango invertido', 'from=2026-10-05&to=2026-10-01'],
    ['rango de más de un año', 'from=2026-01-01&to=2027-01-02'],
    ['solo fecha inicial', 'from=2026-10-01'],
    ['rango con periodo', 'from=2026-10-01&to=2026-10-02&period=day'],
    ['fecha inexistente', 'date=2026-02-30'],
    ['periodo desconocido', 'period=year'],
  ])('rechaza %s', async (_name, query) => {
    const response = await get(a, `/api/reports?${query}`);
    expect(response.statusCode, response.body).toBe(400);
    expect(response.json().code).toBe('validation_error');
  });

  it('exige sesión', async () => {
    expect((await get(null, '/api/reports')).statusCode).toBe(401);
    expect((await get(null, '/api/dashboard')).statusCode).toBe(401);
  });
});

describe('dashboard', () => {
  it('resume el día y lo pendiente de cualquier día', async () => {
    await scenario();
    const dashboard = (await get(a, '/api/dashboard')).json<Dashboard>();
    expect(dashboard).toEqual({
      date: '2026-10-15',
      salesTotal: '111.00',
      salesCount: 2,
      collected: '145.00',
      collectedByMethod: { cash: '125.00', transfer: '20.00' },
      pendingCount: 1,
      pendingTotal: '41.00',
      estimatedGrossProfit: '56.00',
      isGrossLoss: false,
      dayPrepared: true,
    });
  });

  it('una venta pendiente de ayer se suma a lo pendiente de hoy', async () => {
    const tamal = await product(a, 'Tamal', '25.00', '14.00');
    await offer(yesterday, a, tamal.id);
    await sell(yesterday, a, [{ productId: tamal.id, quantity: '2' }]);
    const dashboard = (await get(a, '/api/dashboard')).json<Dashboard>();
    expect(dashboard).toMatchObject({
      salesCount: 0,
      salesTotal: '0.00',
      pendingCount: 1,
      pendingTotal: '50.00',
      dayPrepared: false,
    });
  });

  it('un día sin datos muestra ceros', async () => {
    expect((await get(b, '/api/dashboard')).json<Dashboard>()).toEqual({
      date: '2026-10-15',
      salesTotal: '0.00',
      salesCount: 0,
      collected: '0.00',
      collectedByMethod: { cash: '0.00', transfer: '0.00' },
      pendingCount: 0,
      pendingTotal: '0.00',
      estimatedGrossProfit: '0.00',
      isGrossLoss: false,
      dayPrepared: false,
    });
  });
});

describe('historial de ventas', () => {
  const list = async (query = '', s: Session = a) => {
    const response = await get(s, `/api/sales${query}`);
    expect(response.statusCode, response.body).toBe(200);
    return response.json<SalesList>();
  };
  const folios = (result: SalesList) => result.items.map((item) => item.folio);

  it('lista todas las ventas, la más nueva primero, con cobro y canceladas marcadas', async () => {
    await scenario();
    const all = await list();
    expect(all.total).toBe(4);
    expect(folios(all)).toEqual(['V-0004', 'V-0003', 'V-0002', 'V-0001']);
    expect(all.items.map((item) => item.paymentStatus)).toEqual([
      'cancelled',
      'partial',
      'paid',
      'paid',
    ]);
    expect(all.items[0]).toMatchObject({
      status: 'cancelled',
      total: '100.00',
      paid: '30.00',
      balance: '0.00',
    });
    expect(all.items[1]).toMatchObject({
      customerReference: 'Ana López',
      total: '61.00',
      paid: '20.00',
      balance: '41.00',
      date: '2026-10-15',
    });
    expect(all.items[3]).toMatchObject({ date: '2026-10-14', total: '75.00', paid: '75.00' });
  });

  it('filtra por estado, cobro y fechas', async () => {
    const { tamal } = await scenario();
    await sell(app, a, [{ productId: tamal.id, quantity: '1' }]); // V-0005 sin pagos

    expect(folios(await list('?status=cancelled'))).toEqual(['V-0004']);
    expect(folios(await list('?status=active'))).toEqual(['V-0005', 'V-0003', 'V-0002', 'V-0001']);
    expect(folios(await list('?collection=pending'))).toEqual(['V-0005']);
    expect(folios(await list('?collection=partial'))).toEqual(['V-0003']);
    expect(folios(await list('?collection=paid'))).toEqual(['V-0002', 'V-0001']);
    expect(folios(await list('?from=2026-10-14&to=2026-10-14'))).toEqual(['V-0001']);
    expect((await list('?from=2026-10-16')).total).toBe(0);
  });

  it('busca por folio (con o sin prefijo) y por referencia del cliente sin distinguir mayúsculas', async () => {
    await scenario();
    expect(folios(await list('?q=V-0003'))).toEqual(['V-0003']);
    expect(folios(await list('?q=v-3'))).toEqual(['V-0003']);
    expect(folios(await list('?q=2'))).toEqual(['V-0002']);
    expect(folios(await list('?q=ana'))).toEqual(['V-0003']);
    expect(folios(await list(`?q=${encodeURIComponent('LÓPEZ')}`))).toEqual(['V-0003']);
    expect((await list('?q=zzz')).total).toBe(0);
    // Los comodines de LIKE se buscan como texto, no como patrón.
    expect((await list(`?q=${encodeURIComponent('%')}`)).total).toBe(0);
    expect((await list(`?q=${encodeURIComponent('_')}`)).total).toBe(0);
    expect((await list('?q=')).total).toBe(4);
  });

  it('pagina sin perder el total', async () => {
    await scenario();
    const page = await list('?limit=2&offset=1');
    expect(folios(page)).toEqual(['V-0003', 'V-0002']);
    expect(page).toMatchObject({ total: 4, limit: 2, offset: 1 });
    expect((await list('?limit=2&offset=4')).items).toEqual([]);
  });

  it('rechaza filtros inválidos', async () => {
    for (const query of [
      '?limit=0',
      '?limit=101',
      '?offset=-1',
      '?status=otra',
      '?collection=cancelled',
      '?status=cancelled&collection=paid',
      '?from=2026-10-05&to=2026-10-01',
      '?from=ayer',
    ]) {
      const response = await get(a, `/api/sales${query}`);
      expect(response.statusCode, query).toBe(400);
    }
    expect((await get(null, '/api/sales')).statusCode).toBe(401);
  });
});

describe('aislamiento entre tiendas', () => {
  it('la tienda B no ve ventas, cobros ni productos de la A en historial, reporte ni dashboard', async () => {
    await scenario();
    const tamalB = await product(b, 'Tamal', '25.00', '14.00');
    await offer(app, b, tamalB.id);
    await sell(app, b, [{ productId: tamalB.id, quantity: '1' }], {
      payments: [{ method: 'cash', amount: '25' }],
    });

    const history = (await get(b, '/api/sales')).json<SalesList>();
    expect(history.total).toBe(1);
    expect(history.items[0]).toMatchObject({ folio: 'V-0001', total: '25.00' });
    expect((await get(b, '/api/sales?q=ana')).json<SalesList>().total).toBe(0);

    const report = (await get(b, '/api/reports?period=month')).json<Report>();
    expect(report).toMatchObject({
      salesTotal: '25.00',
      salesCount: 1,
      collected: '25.00',
      pending: '0.00',
      cancelled: { count: 0, total: '0.00', refundDue: '0.00' },
    });
    expect(report.topProducts).toHaveLength(1);
    expect(report.topProducts[0]!.productId).toBe(tamalB.id);

    const dashboard = (await get(b, '/api/dashboard')).json<Dashboard>();
    expect(dashboard).toMatchObject({ salesTotal: '25.00', pendingCount: 0, pendingTotal: '0.00' });

    // Y la A sigue viendo solo lo suyo.
    expect((await get(a, '/api/reports')).json<Report>().salesTotal).toBe('111.00');
    expect((await get(a, '/api/sales')).json<SalesList>().total).toBe(4);
  });
});
