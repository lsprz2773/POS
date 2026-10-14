import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type Dashboard,
  type PendingList,
  type Product,
  type Report,
  type Sale,
  type SalesList,
  type SellerDetail,
  type SellersReport,
} from '@pos/shared';
import { createDb, type Database } from '../src/db/client';
import { addSeller, createTwoTenants, makeApp, resetData, type Session } from './support/app';

// Jueves 15 de octubre de 2026, 12:00 en la Ciudad de México.
const NOW = new Date('2026-10-15T18:00:00Z');
const at = (iso: string) => new Date(iso);

let db: Database;
let app: FastifyInstance;
let a: Session;
let b: Session;
let vera: Session;
let raul: Session;
let tamal: Product;

beforeAll(() => {
  db = createDb(process.env.TEST_DATABASE_URL!);
});

afterAll(async () => {
  await db.destroy();
});

const call = (
  s: Pick<Session, 'cookie'>,
  method: 'GET' | 'POST',
  url: string,
  payload?: unknown,
  headers: Record<string, string> = {},
  server: FastifyInstance = app,
) =>
  server.inject({
    method,
    url,
    headers: { cookie: s.cookie, ...headers },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });

/** Prepara el día de una persona y registra una venta, en la fecha que marque el reloj del servidor dado. */
async function sellOn(
  server: FastifyInstance,
  s: Session,
  pieces: number,
  payments?: { method: 'cash' | 'transfer'; amount: string }[],
) {
  const prepared = await call(
    s,
    'POST',
    '/api/workdays/today/offers',
    { productId: tamal.id, quantity: '50' },
    {},
    server,
  );
  // Si ya había preparado ese día (una segunda venta), el conflicto es esperado.
  expect([201, 409]).toContain(prepared.statusCode);
  const response = await call(
    s,
    'POST',
    '/api/sales',
    {
      items: [{ productId: tamal.id, quantity: String(pieces) }],
      ...(payments ? { payments } : {}),
    },
    { 'idempotency-key': randomUUID() },
    server,
  );
  expect(response.statusCode, response.body).toBe(201);
  return response.json<Sale>();
}

beforeEach(async () => {
  await resetData(db);
  app = makeApp(db, { clock: () => NOW });
  await app.ready();
  ({ a, b } = await createTwoTenants(app, db));
  vera = await addSeller(app, db, a.tenantId, 'vera@tienda-a.test');
  raul = await addSeller(app, db, a.tenantId, 'raul@tienda-a.test');
  await db
    .updateTable('users')
    .set({ display_name: 'Vera López' })
    .where('id', '=', vera.userId)
    .execute();
  tamal = (
    await call(a, 'POST', '/api/products', { name: 'Tamal', price: '25', cost: '14' })
  ).json<Product>();
});

/** Hoy: el propietario vende 1 pagada; Vera 2 pagadas y 4 con 40 cobrados; Raúl 3 sin cobrar y 1 cancelada. */
async function todaysSales() {
  await sellOn(app, a, 1, [{ method: 'cash', amount: '25.00' }]);
  await sellOn(app, vera, 2, [{ method: 'transfer', amount: '50.00' }]);
  await sellOn(app, vera, 4, [{ method: 'cash', amount: '40.00' }]);
  await sellOn(app, raul, 3);
  const cancelled = await sellOn(app, raul, 1);
  const response = await call(raul, 'POST', `/api/sales/${cancelled.id}/cancel`, {
    reason: 'Se equivocó',
  });
  expect(response.statusCode, response.body).toBe(200);
}

const report = async (s: Session, query = '?period=day&date=2026-10-15') =>
  (await call(s, 'GET', `/api/reports/sellers${query}`)).json<SellersReport>();
const row = (r: SellersReport, session: Session) =>
  r.items.find((i) => i.userId === session.userId)!;

describe('reporte por vendedor', () => {
  it('cada persona trae sus cifras con las mismas definiciones del reporte general', async () => {
    await todaysSales();
    const r = await report(a);
    expect(r).toMatchObject({ from: '2026-10-15', to: '2026-10-15', hasSellers: true });
    expect(r.items.map((i) => [i.name, i.role])).toEqual([
      ['ana@tienda-a.test', 'owner'],
      ['raul@tienda-a.test', 'seller'],
      ['Vera López', 'seller'],
    ]);

    expect(row(r, a)).toMatchObject({
      salesTotal: '25.00',
      salesCount: 1,
      averageTicket: '25.00',
      unitsSold: '1',
      collected: '25.00',
      collectedByMethod: { cash: '25.00', transfer: '0.00' },
      pending: '0.00',
      costOfGoodsSold: '14.00',
      grossProfit: '11.00',
      isGrossLoss: false,
      grossMargin: '44.00',
      owed: { total: '0.00', count: 0 },
    });
    expect(row(r, vera)).toMatchObject({
      salesTotal: '150.00',
      salesCount: 2,
      averageTicket: '75.00',
      unitsSold: '6',
      collected: '90.00',
      collectedByMethod: { cash: '40.00', transfer: '50.00' },
      pending: '60.00',
      costOfGoodsSold: '84.00',
      grossProfit: '66.00',
      grossMargin: '44.00',
      share: '60.00',
      owed: { total: '60.00', count: 1 },
    });
    expect(row(r, raul)).toMatchObject({
      salesTotal: '75.00',
      salesCount: 1,
      collected: '0.00',
      pending: '75.00',
      share: '30.00',
      owed: { total: '75.00', count: 1 },
      cancelled: { count: 1, total: '25.00', refundDue: '0.00', rate: '50.00' },
    });
  });

  it('la suma de todas las filas coincide con el reporte general (RF-144)', async () => {
    await todaysSales();
    const r = await report(a);
    const general = (
      await call(a, 'GET', '/api/reports?period=day&date=2026-10-15')
    ).json<Report>();
    expect(r.totals).toMatchObject({
      salesTotal: general.salesTotal,
      salesCount: general.salesCount,
      costOfGoodsSold: general.costOfGoodsSold,
      grossProfit: general.grossProfit,
      collected: general.collected,
      pending: general.pending,
    });
    const pending = (await call(a, 'GET', '/api/sales/pending')).json<PendingList>();
    expect(r.totals.owed).toEqual({ total: pending.totalBalance, count: pending.total });
  });

  it('lo que se le debe a cada persona no depende del periodo elegido', async () => {
    await todaysSales();
    const other = await report(a, '?period=day&date=2026-10-14');
    expect(other.totals.salesTotal).toBe('0.00');
    expect(row(other, vera)).toMatchObject({
      salesTotal: '0.00',
      owed: { total: '60.00', count: 1 },
    });
    expect(row(other, raul).owed).toEqual({ total: '75.00', count: 1 });
    const week = await report(a, '?period=week&date=2026-10-15');
    expect(week).toMatchObject({ from: '2026-10-12', to: '2026-10-18' });
    expect(row(week, vera).owed).toEqual({ total: '60.00', count: 1 });
  });

  it('un vendedor activo sin ventas sale en ceros; uno dado de baja solo si tiene movimiento', async () => {
    const r = await report(a);
    expect(r.items.map((i) => i.userId).sort()).toEqual(
      [a.userId, raul.userId, vera.userId].sort(),
    );
    expect(row(r, vera)).toMatchObject({
      salesTotal: '0.00',
      salesCount: 0,
      grossMargin: null,
      share: null,
    });

    await db
      .updateTable('memberships')
      .set({ status: 'disabled' })
      .where('user_id', '=', raul.userId)
      .execute();
    expect((await report(a)).items.map((i) => i.userId)).not.toContain(raul.userId);

    await sellOn(app, vera, 1);
    await db
      .updateTable('memberships')
      .set({ status: 'disabled' })
      .where('user_id', '=', vera.userId)
      .execute();
    const withHistory = await report(a);
    expect(row(withHistory, vera)).toMatchObject({ status: 'disabled', salesCount: 1 });
  });

  it('una tienda sin vendedores lo indica y solo trae al propietario', async () => {
    const r = await report(b);
    expect(r.hasSellers).toBe(false);
    expect(r.items.map((i) => i.role)).toEqual(['owner']);
  });

  it('valida el periodo y rechaza rangos incompletos', async () => {
    expect((await call(a, 'GET', '/api/reports/sellers?from=2026-10-01')).statusCode).toBe(400);
    expect((await call(a, 'GET', '/api/reports/sellers?period=siglo')).statusCode).toBe(400);
  });

  it('un vendedor no puede verlo y la otra tienda solo ve su propia gente', async () => {
    await todaysSales();
    expect((await call(vera, 'GET', '/api/reports/sellers')).statusCode).toBe(403);
    expect((await call(vera, 'GET', `/api/reports/sellers/${raul.userId}`)).statusCode).toBe(403);
    const other = await report(b);
    expect(other.items.map((i) => i.userId)).toEqual([b.userId]);
    expect(other.totals.salesTotal).toBe('0.00');
  });
});

describe('detalle de un vendedor', () => {
  const detail = async (s: Session, who: Session, query = '?period=week&date=2026-10-15') =>
    (await call(s, 'GET', `/api/reports/sellers/${who.userId}${query}`)).json<SellerDetail>();

  async function history() {
    // Ventas de días anteriores, con el reloj de ese día.
    const sat = makeApp(db, { clock: () => at('2026-10-10T18:00:00Z') });
    const mon = makeApp(db, { clock: () => at('2026-10-05T18:00:00Z') });
    const sep = makeApp(db, { clock: () => at('2026-09-01T18:00:00Z') });
    await Promise.all([sat.ready(), mon.ready(), sep.ready()]);
    await sellOn(sat, vera, 1); // 5 días: hasta 7
    await sellOn(mon, vera, 1); // 10 días: de 8 a 30
    await sellOn(sep, vera, 2); // 44 días: más de 30
    await Promise.all([sat.close(), mon.close(), sep.close()]);
  }

  it('trae sus cifras, productos, serie diaria con ceros y el periodo anterior', async () => {
    await history();
    await todaysSales();
    const d = await detail(a, vera);
    expect(d).toMatchObject({ from: '2026-10-12', to: '2026-10-18' });
    expect(d.seller).toMatchObject({
      userId: vera.userId,
      name: 'Vera López',
      salesTotal: '150.00',
      salesCount: 2,
    });
    expect(d.topProducts).toEqual([
      expect.objectContaining({ productId: tamal.id, units: '6', amount: '150.00' }),
    ]);
    expect(d.daily).toHaveLength(7);
    expect(d.daily.find((day) => day.date === '2026-10-15')).toEqual({
      date: '2026-10-15',
      salesTotal: '150.00',
      salesCount: 2,
    });
    expect(
      d.daily.filter((day) => day.salesCount === 0).every((day) => day.salesTotal === '0.00'),
    ).toBe(true);
    // Semana anterior (5 a 11 de octubre): las ventas del lunes 5 y del sábado 10.
    expect(d.previous).toEqual({
      from: '2026-10-05',
      to: '2026-10-11',
      salesTotal: '50.00',
      salesCount: 2,
      grossProfit: '22.00',
    });
  });

  it('desglosa la antigüedad de lo que se le debe', async () => {
    await history();
    await todaysSales();
    const d = await detail(a, vera);
    // Hoy 60 (0 días), sábado 25 (5 días), lunes 5 de octubre 25 (10 días) y 1 de septiembre 50 (44 días).
    expect(d.aging).toEqual({
      upTo7: { total: '85.00', count: 2 },
      from8To30: { total: '25.00', count: 1 },
      over30: { total: '50.00', count: 1 },
    });
    expect(d.seller.owed).toEqual({ total: '160.00', count: 4 });
  });

  it('calcula el aprovechamiento: piezas preparadas contra vendidas', async () => {
    await todaysSales();
    const d = await detail(a, vera, '?period=day&date=2026-10-15');
    expect(d.utilization).toEqual({
      preparedUnits: '50',
      soldUnits: '6',
      soldPercent: '12.00',
      products: 1,
      soldOutProducts: 0,
    });
    const idle = await detail(a, a, '?period=day&date=2026-10-14');
    expect(idle.utilization).toMatchObject({ preparedUnits: '0', soldPercent: null, products: 0 });
  });

  it('cuenta un producto agotado', async () => {
    await sellOn(app, raul, 50);
    const d = await detail(a, raul, '?period=day&date=2026-10-15');
    expect(d.utilization).toMatchObject({
      soldUnits: '50',
      soldPercent: '100.00',
      soldOutProducts: 1,
    });
  });

  it('el detalle del propio propietario también funciona y compara contra el periodo anterior de un mes', async () => {
    await sellOn(app, a, 2);
    const d = await detail(a, a, '?period=month&date=2026-10-15');
    expect(d).toMatchObject({ from: '2026-10-01', to: '2026-10-31' });
    expect(d.previous).toMatchObject({ from: '2026-09-01', to: '2026-09-30' });
    expect(d.daily).toHaveLength(31);
  });

  it('una persona que no existe, de otra tienda o con id mal formado responde 404', async () => {
    expect((await call(a, 'GET', `/api/reports/sellers/${randomUUID()}`)).statusCode).toBe(404);
    expect((await call(a, 'GET', `/api/reports/sellers/${b.userId}`)).statusCode).toBe(404);
    expect((await call(a, 'GET', '/api/reports/sellers/no-es-uuid')).statusCode).toBe(404);
  });
});

describe('lo que se debe a cada vendedor en Pendientes, Hoy e Historial', () => {
  it('Pendientes trae el desglose por vendedor solo para el propietario con equipo', async () => {
    await todaysSales();
    const owner = (await call(a, 'GET', '/api/sales/pending')).json<PendingList>();
    expect(owner.totalBalance).toBe('135.00');
    expect(owner.bySeller).toEqual([
      expect.objectContaining({ userId: raul.userId, total: '75.00', count: 1, status: 'active' }),
      expect.objectContaining({
        userId: vera.userId,
        name: 'Vera López',
        total: '60.00',
        count: 1,
      }),
    ]);
    expect(owner.items.map((i) => i.createdBy.name).sort()).toEqual([
      'Vera López',
      'raul@tienda-a.test',
    ]);

    const seller = (await call(vera, 'GET', '/api/sales/pending')).json<PendingList>();
    expect(seller.bySeller).toBeUndefined();
    expect(seller.totalBalance).toBe('60.00');

    // La otra tienda no tiene equipo: no hay desglose.
    expect(
      (await call(b, 'GET', '/api/sales/pending')).json<PendingList>().bySeller,
    ).toBeUndefined();
  });

  it('el propietario filtra Pendientes e Historial por vendedor; un vendedor no puede filtrar por otro', async () => {
    await todaysSales();
    const pending = (
      await call(a, 'GET', `/api/sales/pending?sellerId=${vera.userId}`)
    ).json<PendingList>();
    expect(pending.total).toBe(1);
    expect(pending.totalBalance).toBe('60.00');
    expect(pending.items[0]!.createdBy.id).toBe(vera.userId);

    const history = (await call(a, 'GET', `/api/sales?sellerId=${raul.userId}`)).json<SalesList>();
    expect(history.total).toBe(2);
    expect(history.items.every((s) => s.createdBy.id === raul.userId)).toBe(true);
    expect((await call(a, 'GET', `/api/sales?sellerId=${a.userId}`)).json<SalesList>().total).toBe(
      1,
    );

    expect((await call(vera, 'GET', `/api/sales?sellerId=${raul.userId}`)).statusCode).toBe(403);
    expect((await call(vera, 'GET', `/api/sales/pending?sellerId=${raul.userId}`)).statusCode).toBe(
      403,
    );
    expect(
      (await call(vera, 'GET', `/api/sales?sellerId=${vera.userId}`)).json<SalesList>().total,
    ).toBe(2);
    expect((await call(a, 'GET', '/api/sales?sellerId=no-es-uuid')).statusCode).toBe(400);
    // Un vendedor de otra tienda no devuelve nada ni se distingue de uno inexistente.
    expect((await call(a, 'GET', `/api/sales?sellerId=${b.userId}`)).json<SalesList>().total).toBe(
      0,
    );
  });

  it('cada venta dice quién la registró, en el listado y en el detalle', async () => {
    const sale = await sellOn(app, vera, 1);
    expect(sale.createdBy).toEqual({ id: vera.userId, name: 'Vera López' });
    const list = (await call(a, 'GET', '/api/sales')).json<SalesList>();
    expect(list.items[0]!.createdBy).toEqual({ id: vera.userId, name: 'Vera López' });
    const owned = (await call(a, 'GET', `/api/sales/${sale.id}`)).json<Sale>();
    expect(owned.createdBy.name).toBe('Vera López');
    const noName = await sellOn(app, raul, 1);
    expect(noName.createdBy.name).toBe('raul@tienda-a.test'); // sin nombre, el correo
  });

  it('Hoy trae lo de cada persona solo para el propietario con equipo', async () => {
    await todaysSales();
    const owner = (await call(a, 'GET', '/api/dashboard')).json<Dashboard>();
    expect(owner.bySeller).toEqual([
      expect.objectContaining({ userId: a.userId, salesTotal: '25.00', collected: '25.00' }),
      expect.objectContaining({
        userId: raul.userId,
        salesTotal: '75.00',
        salesCount: 1,
        collected: '0.00',
        owed: { total: '75.00', count: 1 },
      }),
      expect.objectContaining({
        userId: vera.userId,
        salesTotal: '150.00',
        collected: '90.00',
        owed: { total: '60.00', count: 1 },
      }),
    ]);
    expect((await call(vera, 'GET', '/api/dashboard')).json<Dashboard>().bySeller).toBeUndefined();
    expect((await call(b, 'GET', '/api/dashboard')).json<Dashboard>().bySeller).toBeUndefined();
  });

  it('el dashboard y el reporte de un vendedor coinciden con su fila en el reporte del equipo', async () => {
    await todaysSales();
    const r = await report(a);
    const dash = (await call(vera, 'GET', '/api/dashboard')).json<Dashboard>();
    const own = (await call(vera, 'GET', '/api/reports?period=day&date=2026-10-15')).json<Report>();
    expect(dash).toMatchObject({
      salesTotal: row(r, vera).salesTotal,
      collected: row(r, vera).collected,
    });
    expect(own).toMatchObject({
      salesTotal: row(r, vera).salesTotal,
      grossProfit: row(r, vera).grossProfit,
      pending: row(r, vera).pending,
    });
  });
});
