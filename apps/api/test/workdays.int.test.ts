import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Product, Workday, WorkdayList } from '@pos/shared';
import { createDb, type Database } from '../src/db/client';
import { createTwoTenants, makeApp, resetData, type Session } from './support/app';

// Jueves 15 de octubre de 2026, 12:00 en la Ciudad de México.
const NOW = new Date('2026-10-15T18:00:00Z');
const TODAY = '2026-10-15';
const TOMORROW = '2026-10-16';

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

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
const call = (s: Session | null, method: Method, url: string, payload?: unknown) =>
  app.inject({
    method,
    url,
    headers: s ? { cookie: s.cookie } : {},
    ...(payload === undefined ? {} : { payload: payload as object }),
  });

async function newProduct(s: Session, name = 'Tamal de rajas', extra: object = {}) {
  const response = await call(s, 'POST', '/api/products', {
    name,
    price: '25',
    cost: '14',
    ...extra,
  });
  expect(response.statusCode, response.body).toBe(201);
  return response.json<Product>();
}

async function addOffer(s: Session, date: string, productId: string, quantity = '40') {
  const response = await call(s, 'POST', `/api/workdays/${date}/offers`, { productId, quantity });
  expect(response.statusCode, response.body).toBe(201);
  return response.json<Workday>();
}

async function insertPastWorkday(s: Session, date: string, productId: string, quantity = '30') {
  const workday = await db
    .insertInto('workdays')
    .values({
      tenant_id: s.tenantId,
      business_date: sql`${date}::date`,
      start_time: sql`'08:00'::time`,
      end_time: sql`'16:00'::time`,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  const offer = await db
    .insertInto('daily_offers')
    .values({
      tenant_id: s.tenantId,
      workday_id: workday.id,
      product_id: productId,
      initial_quantity: quantity,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return { workdayId: workday.id, offerId: offer.id };
}

const auditOf = (s: Session, entity: string, action?: string) => {
  let query = db
    .selectFrom('audit_events')
    .selectAll()
    .where('tenant_id', '=', s.tenantId)
    .where('entity', '=', entity)
    .orderBy('id');
  if (action) query = query.where('action', '=', action);
  return query.execute();
};

describe('preparar la jornada', () => {
  it('un día sin preparar responde "todavía no está preparado"', async () => {
    const response = await call(a, 'GET', '/api/workdays/today');
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      code: 'not_found',
      error: 'Ese día todavía no está preparado.',
    });
  });

  it('el primer producto crea la jornada con el horario de la tienda (08:00 a 16:00)', async () => {
    const product = await newProduct(a, 'Tamal de rajas', { code: 'TAM-01' });
    const workday = await addOffer(a, 'today', product.id, '40');

    expect(workday).toMatchObject({
      date: TODAY,
      startTime: '08:00',
      endTime: '16:00',
      isToday: true,
      editable: true,
      isOperatingDay: true,
    });
    expect(workday.offers).toHaveLength(1);
    expect(workday.offers[0]).toMatchObject({
      productId: product.id,
      productName: 'Tamal de rajas',
      productCode: 'TAM-01',
      unit: 'pieza',
      initialQuantity: '40',
      adjustedQuantity: '0',
      soldQuantity: '0',
      availableQuantity: '40',
      adjustments: [],
    });
    expect(await auditOf(a, 'workday', 'create')).toHaveLength(1);
    const [added] = await auditOf(a, 'daily_offer', 'add');
    expect(added).toMatchObject({
      actor_user_id: a.userId,
      data: { date: TODAY, productName: 'Tamal de rajas', initialQuantity: '40' },
    });
  });

  it('"today" y la fecha explícita son la misma jornada', async () => {
    const product = await newProduct(a);
    await addOffer(a, 'today', product.id);
    const byDate = await call(a, 'GET', `/api/workdays/${TODAY}`);
    const byAlias = await call(a, 'GET', '/api/workdays/today');
    expect(byDate.json()).toEqual(byAlias.json());
  });

  it('"hoy" se calcula con la zona horaria de la tienda, no con UTC', async () => {
    const lateNight = makeApp(db, { clock: () => new Date('2026-10-16T05:30:00Z') });
    await lateNight.ready();
    const product = await newProduct(a);
    const response = await lateNight.inject({
      method: 'POST',
      url: '/api/workdays/today/offers',
      headers: { cookie: a.cookie },
      payload: { productId: product.id, quantity: '5' },
    });
    // 05:30 UTC del 16 todavía es el 15 en la Ciudad de México.
    expect(response.json<Workday>().date).toBe(TODAY);

    await call(a, 'PATCH', '/api/store', { timezone: 'Asia/Tokyo' });
    const tokyo = await lateNight.inject({
      method: 'GET',
      url: '/api/workdays/today',
      headers: { cookie: a.cookie },
    });
    expect(tokyo.statusCode).toBe(404);
    await lateNight.close();
  });

  it('una sola jornada por fecha aunque se agreguen varios productos', async () => {
    const [p1, p2] = [await newProduct(a, 'Tamal'), await newProduct(a, 'Jugo')];
    await addOffer(a, 'today', p1.id);
    const workday = await addOffer(a, 'today', p2.id, '30');
    expect(workday.offers.map((o) => o.productName)).toEqual(['Jugo', 'Tamal']);

    const list = (await call(a, 'GET', '/api/workdays')).json<WorkdayList>();
    expect(list.total).toBe(1);
    expect(list.items[0]).toMatchObject({ date: TODAY, products: 2 });
    expect(await auditOf(a, 'workday', 'create')).toHaveLength(1);
  });

  it('configurar un día no modifica otro', async () => {
    const [p1, p2] = [await newProduct(a, 'Tamal'), await newProduct(a, 'Jugo')];
    await addOffer(a, TODAY, p1.id, '40');
    await addOffer(a, TOMORROW, p2.id, '10');
    await call(a, 'PATCH', `/api/workdays/${TOMORROW}`, { startTime: '09:00', endTime: '13:00' });

    const today = (await call(a, 'GET', `/api/workdays/${TODAY}`)).json<Workday>();
    const tomorrow = (await call(a, 'GET', `/api/workdays/${TOMORROW}`)).json<Workday>();
    expect(today.offers.map((o) => o.productName)).toEqual(['Tamal']);
    expect(today).toMatchObject({ startTime: '08:00', endTime: '16:00' });
    expect(tomorrow.offers.map((o) => o.productName)).toEqual(['Jugo']);
    expect(tomorrow).toMatchObject({ startTime: '09:00', endTime: '13:00', isToday: false });
  });

  it('no deja agregar el mismo producto dos veces: dirige al registro existente', async () => {
    const product = await newProduct(a);
    await addOffer(a, 'today', product.id);
    const response = await call(a, 'POST', '/api/workdays/today/offers', {
      productId: product.id,
      quantity: '5',
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'conflict',
      fields: { productId: expect.stringContaining('ya está en el día') },
    });
    const workday = (await call(a, 'GET', '/api/workdays/today')).json<Workday>();
    expect(workday.offers).toHaveLength(1);
    expect(workday.offers[0]!.initialQuantity).toBe('40');
  });

  it('permite cantidad inicial 0 y normaliza decimales', async () => {
    const [whole, fractional] = [await newProduct(a, 'Tamal'), await newProduct(a, 'Queso')];
    const zero = await addOffer(a, 'today', whole.id, '0');
    expect(zero.offers[0]).toMatchObject({ initialQuantity: '0', availableQuantity: '0' });
    // Un producto de piezas enteras no admite fracciones, aunque la columna sí las guarde.
    const fraction = await call(a, 'POST', '/api/workdays/today/offers', {
      productId: fractional.id,
      quantity: '2.5',
    });
    expect(fraction.statusCode).toBe(400);
    expect(fraction.json().fields.quantity).toBe('Este producto se vende en piezas enteras.');
    const padded = await addOffer(a, 'today', fractional.id, '007.000');
    expect(padded.offers.find((o) => o.productName === 'Queso')!.initialQuantity).toBe('7');
  });

  it('un producto que admite fracciones acepta cantidades decimales exactas', async () => {
    const product = await newProduct(a, 'Queso por kilo');
    await db
      .updateTable('products')
      .set({ allows_fractions: true, unit: 'kg' })
      .where('id', '=', product.id)
      .execute();
    const workday = await addOffer(a, 'today', product.id, '2.5');
    expect(workday.offers[0]).toMatchObject({
      unit: 'kg',
      allowsFractions: true,
      initialQuantity: '2.5',
      availableQuantity: '2.5',
    });
    const adjusted = await call(
      a,
      'POST',
      `/api/workdays/today/offers/${workday.offers[0]!.id}/adjustments`,
      { increment: '0.25', reason: 'Llegó más queso' },
    );
    expect(adjusted.json<Workday>().offers[0]).toMatchObject({
      adjustedQuantity: '0.25',
      availableQuantity: '2.75',
    });
  });
});

describe('validaciones al agregar productos', () => {
  it('rechaza cantidades negativas, no numéricas y fuera de rango', async () => {
    const product = await newProduct(a);
    const url = '/api/workdays/today/offers';
    const negative = await call(a, 'POST', url, { productId: product.id, quantity: '-1' });
    expect(negative.statusCode).toBe(400);
    expect(negative.json().fields.quantity).toBe('No puede ser negativa.');
    for (const bad of ['abc', '', '1.2345', '1e3', '1234567890']) {
      const r = await call(a, 'POST', url, { productId: product.id, quantity: bad });
      expect(r.statusCode, bad).toBe(400);
    }
    expect((await call(a, 'POST', url, { productId: product.id, quantity: 5 })).statusCode).toBe(
      400,
    );
    expect((await call(a, 'GET', '/api/workdays')).json().total).toBe(0);
  });

  it('rechaza productos inexistentes, de otra tienda o desactivados', async () => {
    const own = await newProduct(a, 'Propio');
    const foreign = await newProduct(b, 'Ajeno');
    const url = '/api/workdays/today/offers';

    const unknown = await call(a, 'POST', url, {
      productId: '5b2c1a54-7a8e-4a8e-9a55-4b0a1f6d2a10',
      quantity: '5',
    });
    const other = await call(a, 'POST', url, { productId: foreign.id, quantity: '5' });
    expect(unknown.statusCode).toBe(400);
    expect(other.statusCode).toBe(400);
    expect(other.json().fields.productId).toBe('Ese producto no está disponible.');
    expect(unknown.json().fields).toEqual(other.json().fields);

    await call(a, 'PATCH', `/api/products/${own.id}`, { version: 1, active: false });
    const inactive = await call(a, 'POST', url, { productId: own.id, quantity: '5' });
    expect(inactive.statusCode).toBe(400);
    expect(inactive.json().fields.productId).toMatch(/desactivado/);

    // Ninguno de los intentos fallidos deja una jornada vacía.
    expect((await call(a, 'GET', '/api/workdays')).json().total).toBe(0);
  });

  it('rechaza campos desconocidos como tenantId y fechas inválidas', async () => {
    const product = await newProduct(a);
    const withTenant = await call(a, 'POST', '/api/workdays/today/offers', {
      productId: product.id,
      quantity: '5',
      tenantId: b.tenantId,
    });
    expect(withTenant.statusCode).toBe(400);
    for (const date of ['hoy', '2026-02-30', '15-10-2026', '2026-13-01']) {
      const r = await call(a, 'GET', `/api/workdays/${date}`);
      expect(r.statusCode, date).toBe(400);
      expect(r.json().code).toBe('validation_error');
    }
  });
});

describe('aumentar la cantidad (ajustes)', () => {
  it('suma al inicial, deja el ajuste registrado con motivo y responsable', async () => {
    const product = await newProduct(a);
    const day = await addOffer(a, 'today', product.id, '40');
    const offerId = day.offers[0]!.id;

    const response = await call(a, 'POST', `/api/workdays/today/offers/${offerId}/adjustments`, {
      increment: '10',
      reason: 'Se preparó más producto',
    });
    expect(response.statusCode).toBe(201);
    const offer = response.json<Workday>().offers[0]!;
    expect(offer).toMatchObject({
      initialQuantity: '40',
      adjustedQuantity: '10',
      soldQuantity: '0',
      availableQuantity: '50',
    });
    expect(offer.adjustments).toHaveLength(1);
    expect(offer.adjustments[0]).toMatchObject({
      increment: '10',
      reason: 'Se preparó más producto',
      userEmail: a.email,
    });

    const [event] = await auditOf(a, 'daily_offer', 'adjust');
    expect(event).toMatchObject({
      entity_id: offerId,
      actor_user_id: a.userId,
      data: {
        increment: '10',
        reason: 'Se preparó más producto',
        adjustedBefore: '0',
        adjustedAfter: '10',
      },
    });
  });

  it('acumula varios aumentos y no modifica la cantidad inicial', async () => {
    const product = await newProduct(a);
    const day = await addOffer(a, 'today', product.id, '40');
    const url = `/api/workdays/today/offers/${day.offers[0]!.id}/adjustments`;
    await call(a, 'POST', url, { increment: '10', reason: 'Primero' });
    const last = await call(a, 'POST', url, { increment: '5', reason: 'Segundo' });
    const offer = last.json<Workday>().offers[0]!;
    expect(offer).toMatchObject({
      initialQuantity: '40',
      adjustedQuantity: '15',
      availableQuantity: '55',
    });
    expect(offer.adjustments.map((x) => x.reason)).toEqual(['Primero', 'Segundo']);
  });

  it('nunca baja la cantidad: cero, negativos y sin motivo se rechazan', async () => {
    const product = await newProduct(a);
    const day = await addOffer(a, 'today', product.id, '40');
    const url = `/api/workdays/today/offers/${day.offers[0]!.id}/adjustments`;

    const zero = await call(a, 'POST', url, { increment: '0', reason: 'x' });
    expect(zero.json().fields.increment).toBe('Escribe una cantidad mayor que cero.');
    const negative = await call(a, 'POST', url, { increment: '-5', reason: 'x' });
    expect(negative.json().fields.increment).toBe('No puede ser negativa.');
    const noReason = await call(a, 'POST', url, { increment: '5' });
    expect(noReason.statusCode).toBe(400);
    const blank = await call(a, 'POST', url, { increment: '5', reason: '   ' });
    expect(blank.json().fields.reason).toBe('Escribe el motivo del aumento.');
    const fractional = await call(a, 'POST', url, { increment: '1.5', reason: 'x' });
    expect(fractional.json().fields.increment).toBe('Este producto se vende en piezas enteras.');

    const unchanged = (await call(a, 'GET', '/api/workdays/today')).json<Workday>();
    expect(unchanged.offers[0]).toMatchObject({ adjustedQuantity: '0', availableQuantity: '40' });
    expect(await auditOf(a, 'daily_offer', 'adjust')).toHaveLength(0);
  });

  it('un producto inexistente en el día o con identificador mal formado no existe', async () => {
    const product = await newProduct(a);
    await addOffer(a, 'today', product.id);
    const payload = { increment: '1', reason: 'x' };
    const missing = await call(
      a,
      'POST',
      '/api/workdays/today/offers/5b2c1a54-7a8e-4a8e-9a55-4b0a1f6d2a10/adjustments',
      payload,
    );
    const malformed = await call(a, 'POST', '/api/workdays/today/offers/xyz/adjustments', payload);
    expect(missing.statusCode).toBe(404);
    expect(malformed.statusCode).toBe(404);
  });
});

describe('quitar un producto del día', () => {
  it('lo quita junto con sus aumentos y deja el rastro en la auditoría', async () => {
    const [keep, drop] = [await newProduct(a, 'Tamal'), await newProduct(a, 'Gelatina')];
    await addOffer(a, 'today', keep.id);
    const day = await addOffer(a, 'today', drop.id, '25');
    const offerId = day.offers.find((o) => o.productName === 'Gelatina')!.id;
    await call(a, 'POST', `/api/workdays/today/offers/${offerId}/adjustments`, {
      increment: '5',
      reason: 'Extra',
    });

    const response = await call(a, 'DELETE', `/api/workdays/today/offers/${offerId}`);
    expect(response.statusCode).toBe(200);
    expect(response.json<Workday>().offers.map((o) => o.productName)).toEqual(['Tamal']);

    const remaining = await db
      .selectFrom('stock_adjustments')
      .select('id')
      .where('daily_offer_id', '=', offerId)
      .execute();
    expect(remaining).toHaveLength(0);
    const [event] = await auditOf(a, 'daily_offer', 'remove');
    expect(event).toMatchObject({
      entity_id: offerId,
      data: { productName: 'Gelatina', initialQuantity: '25.000', adjustedQuantity: '5.000' },
    });
  });

  it('el producto quitado se puede volver a agregar', async () => {
    const product = await newProduct(a);
    const day = await addOffer(a, 'today', product.id, '99');
    await call(a, 'DELETE', `/api/workdays/today/offers/${day.offers[0]!.id}`);
    const again = await addOffer(a, 'today', product.id, '30');
    expect(again.offers[0]!.initialQuantity).toBe('30');
  });

  it('un producto que no está en el día responde 404', async () => {
    const product = await newProduct(a);
    await addOffer(a, 'today', product.id);
    const r = await call(
      a,
      'DELETE',
      '/api/workdays/today/offers/5b2c1a54-7a8e-4a8e-9a55-4b0a1f6d2a10',
    );
    expect(r.statusCode).toBe(404);
    expect((await call(a, 'DELETE', '/api/workdays/today/offers/xyz')).statusCode).toBe(404);
  });
});

describe('horario de la jornada', () => {
  it('se ajusta por día sin tocar la configuración de la tienda', async () => {
    const product = await newProduct(a);
    await addOffer(a, 'today', product.id);
    const response = await call(a, 'PATCH', '/api/workdays/today', {
      startTime: '07:30',
      endTime: '14:00',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ startTime: '07:30', endTime: '14:00' });
    const [event] = await auditOf(a, 'workday', 'update_hours');
    expect(event!.data).toMatchObject({
      before: { startTime: '08:00', endTime: '16:00' },
      after: { startTime: '07:30', endTime: '14:00' },
    });
    expect((await call(a, 'GET', '/api/store')).json()).toMatchObject({
      workdayStart: '08:00',
      workdayEnd: '16:00',
    });
  });

  it('valida el orden y el formato de las horas, aun si solo cambia una', async () => {
    const product = await newProduct(a);
    await addOffer(a, 'today', product.id);
    const url = '/api/workdays/today';
    expect((await call(a, 'PATCH', url, { endTime: '07:00' })).json().fields.endTime).toMatch(
      /posterior/,
    );
    expect((await call(a, 'PATCH', url, { startTime: '17:00' })).statusCode).toBe(400);
    expect((await call(a, 'PATCH', url, { startTime: '25:00' })).statusCode).toBe(400);
    expect((await call(a, 'PATCH', url, {})).statusCode).toBe(400);
    expect(
      (await call(a, 'PATCH', url, { startTime: '09:00', tenantId: b.tenantId })).statusCode,
    ).toBe(400);
  });

  it('sin cambios reales no deja auditoría', async () => {
    const product = await newProduct(a);
    await addOffer(a, 'today', product.id);
    const r = await call(a, 'PATCH', '/api/workdays/today', {
      startTime: '08:00',
      endTime: '16:00',
    });
    expect(r.statusCode).toBe(200);
    expect(await auditOf(a, 'workday', 'update_hours')).toHaveLength(0);
  });

  it('un día que no está preparado no tiene horario que ajustar', async () => {
    const r = await call(a, 'PATCH', '/api/workdays/today', { startTime: '09:00' });
    expect(r.statusCode).toBe(404);
  });
});

describe('días de operación y fechas', () => {
  it('marca si el día es de operación (lunes a viernes por omisión)', async () => {
    const product = await newProduct(a);
    const saturday = await addOffer(a, '2026-10-17', product.id);
    expect(saturday.isOperatingDay).toBe(false);
    await call(a, 'PATCH', '/api/store', { operatingDays: [1, 2, 3, 4, 5, 6] });
    const again = (await call(a, 'GET', '/api/workdays/2026-10-17')).json<Workday>();
    expect(again.isOperatingDay).toBe(true);
    // Un sábado igual admite jornada: el día de operación solo se destaca.
    expect(saturday.offers).toHaveLength(1);
  });

  it('se puede preparar hasta 60 días adelante, no más', async () => {
    const product = await newProduct(a);
    const limit = await call(a, 'POST', '/api/workdays/2026-12-14/offers', {
      productId: product.id,
      quantity: '5',
    });
    expect(limit.statusCode).toBe(201);
    const beyond = await call(a, 'POST', '/api/workdays/2026-12-15/offers', {
      productId: product.id,
      quantity: '5',
    });
    expect(beyond.statusCode).toBe(400);
    expect(beyond.json().fields.date).toMatch(/60 días/);
  });

  it('una jornada pasada es de solo consulta', async () => {
    const product = await newProduct(a);
    const { offerId } = await insertPastWorkday(a, '2026-10-14', product.id, '30');

    const view = (await call(a, 'GET', '/api/workdays/2026-10-14')).json<Workday>();
    expect(view).toMatchObject({ date: '2026-10-14', editable: false, isToday: false });
    expect(view.offers[0]).toMatchObject({ initialQuantity: '30', availableQuantity: '30' });

    const other = await newProduct(a, 'Otro');
    const expectConflict = (r: {
      statusCode: number;
      json: () => { code: string; error: string };
    }) => {
      expect(r.statusCode).toBe(409);
      expect(r.json().error).toBe('Esa jornada ya terminó: solo se puede consultar.');
    };
    expectConflict(
      await call(a, 'POST', '/api/workdays/2026-10-14/offers', {
        productId: other.id,
        quantity: '5',
      }),
    );
    expectConflict(
      await call(a, 'POST', `/api/workdays/2026-10-14/offers/${offerId}/adjustments`, {
        increment: '5',
        reason: 'x',
      }),
    );
    expectConflict(await call(a, 'DELETE', `/api/workdays/2026-10-14/offers/${offerId}`));
    expectConflict(await call(a, 'PATCH', '/api/workdays/2026-10-14', { startTime: '09:00' }));

    const unchanged = (await call(a, 'GET', '/api/workdays/2026-10-14')).json<Workday>();
    expect(unchanged.offers).toHaveLength(1);
  });
});

describe('consultar jornadas anteriores', () => {
  it('lista de la más reciente a la más antigua, con totales por jornada', async () => {
    const [p1, p2] = [await newProduct(a, 'Tamal'), await newProduct(a, 'Jugo')];
    await insertPastWorkday(a, '2026-10-12', p1.id, '20');
    const { offerId } = await insertPastWorkday(a, '2026-10-13', p1.id, '40');
    await addOffer(a, TODAY, p1.id, '10');
    await addOffer(a, TODAY, p2.id, '5');
    await db
      .insertInto('stock_adjustments')
      .values({
        tenant_id: a.tenantId,
        daily_offer_id: offerId,
        increment: '6',
        reason: 'x',
        user_id: a.userId,
      })
      .execute();

    const body = (await call(a, 'GET', '/api/workdays')).json<WorkdayList>();
    expect(body.items.map((w) => w.date)).toEqual([TODAY, '2026-10-13', '2026-10-12']);
    expect(body.total).toBe(3);
    expect(body.items[0]).toMatchObject({
      products: 2,
      initialQuantity: '15',
      adjustedQuantity: '0',
      soldQuantity: '0',
      availableQuantity: '15',
    });
    expect(body.items[1]).toMatchObject({
      products: 1,
      initialQuantity: '40',
      adjustedQuantity: '6',
      availableQuantity: '46',
    });
  });

  it('filtra por rango, pagina y rechaza rangos invertidos o fechas inválidas', async () => {
    const product = await newProduct(a);
    for (const date of ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13']) {
      await insertPastWorkday(a, date, product.id);
    }
    const range = (
      await call(a, 'GET', '/api/workdays?from=2026-10-11&to=2026-10-12')
    ).json<WorkdayList>();
    expect(range.items.map((w) => w.date)).toEqual(['2026-10-12', '2026-10-11']);
    expect(range.total).toBe(2);

    const page = (await call(a, 'GET', '/api/workdays?limit=2&offset=2')).json<WorkdayList>();
    expect(page.items.map((w) => w.date)).toEqual(['2026-10-11', '2026-10-10']);
    expect(page).toMatchObject({ total: 4, limit: 2, offset: 2 });

    const inverted = await call(a, 'GET', '/api/workdays?from=2026-10-13&to=2026-10-11');
    expect(inverted.statusCode).toBe(400);
    expect((await call(a, 'GET', '/api/workdays?from=ayer')).statusCode).toBe(400);
    expect((await call(a, 'GET', '/api/workdays?limit=500')).statusCode).toBe(400);
  });
});

describe('concurrencia', () => {
  it('dos productos agregados a la vez a un día nuevo comparten una sola jornada', async () => {
    const [p1, p2] = [await newProduct(a, 'Tamal'), await newProduct(a, 'Jugo')];
    const results = await Promise.all([
      call(a, 'POST', '/api/workdays/today/offers', { productId: p1.id, quantity: '5' }),
      call(a, 'POST', '/api/workdays/today/offers', { productId: p2.id, quantity: '5' }),
    ]);
    expect(results.map((r) => r.statusCode)).toEqual([201, 201]);
    const workday = (await call(a, 'GET', '/api/workdays/today')).json<Workday>();
    expect(workday.offers).toHaveLength(2);
    expect((await call(a, 'GET', '/api/workdays')).json().total).toBe(1);
  });

  it('el mismo producto agregado a la vez solo entra una vez', async () => {
    const product = await newProduct(a);
    const results = await Promise.all([
      call(a, 'POST', '/api/workdays/today/offers', { productId: product.id, quantity: '5' }),
      call(a, 'POST', '/api/workdays/today/offers', { productId: product.id, quantity: '6' }),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect((await call(a, 'GET', '/api/workdays/today')).json<Workday>().offers).toHaveLength(1);
  });
});

describe('aislamiento entre tiendas', () => {
  it('B no ve la jornada ni la lista de A', async () => {
    const product = await newProduct(a);
    await addOffer(a, 'today', product.id);
    expect((await call(b, 'GET', '/api/workdays/today')).statusCode).toBe(404);
    expect((await call(b, 'GET', `/api/workdays/${TODAY}`)).statusCode).toBe(404);
    expect((await call(b, 'GET', '/api/workdays')).json().total).toBe(0);
  });

  it('B no puede agregar, aumentar, quitar ni cambiar horarios sobre datos de A', async () => {
    const productA = await newProduct(a, 'De A');
    const productB = await newProduct(b, 'De B');
    const dayA = await addOffer(a, 'today', productA.id, '40');
    await addOffer(b, 'today', productB.id, '10');
    const offerA = dayA.offers[0]!.id;

    // El producto de A no se puede ofrecer en la jornada de B.
    const cross = await call(b, 'POST', '/api/workdays/today/offers', {
      productId: productA.id,
      quantity: '5',
    });
    expect(cross.statusCode).toBe(400);

    // Ni siquiera con la misma fecha, B alcanza el registro de A.
    const adjust = await call(b, 'POST', `/api/workdays/today/offers/${offerA}/adjustments`, {
      increment: '5',
      reason: 'intento',
    });
    expect(adjust.statusCode).toBe(404);
    expect((await call(b, 'DELETE', `/api/workdays/today/offers/${offerA}`)).statusCode).toBe(404);

    const after = (await call(a, 'GET', '/api/workdays/today')).json<Workday>();
    expect(after.offers[0]).toMatchObject({ initialQuantity: '40', adjustedQuantity: '0' });
    expect(await auditOf(b, 'daily_offer', 'adjust')).toHaveLength(0);
  });

  it('cada tienda ajusta su horario sin afectar a la otra', async () => {
    const [pa, pb] = [await newProduct(a), await newProduct(b)];
    await addOffer(a, 'today', pa.id);
    await addOffer(b, 'today', pb.id);
    await call(a, 'PATCH', '/api/workdays/today', { startTime: '10:00' });
    expect((await call(b, 'GET', '/api/workdays/today')).json()).toMatchObject({
      startTime: '08:00',
    });
  });

  it('la base impide mezclar tiendas aunque falle la aplicación', async () => {
    const [pa, pb] = [await newProduct(a), await newProduct(b)];
    const dayA = await addOffer(a, 'today', pa.id);
    // Un renglón de la tienda B apuntando a la jornada de A viola la llave compuesta.
    await expect(
      db
        .insertInto('daily_offers')
        .values({
          tenant_id: b.tenantId,
          workday_id: dayA.id,
          product_id: pb.id,
          initial_quantity: '1',
        })
        .execute(),
    ).rejects.toThrow(/daily_offers_workday_fkey/);
    // Y un producto de A en una oferta de B también.
    const dayB = await addOffer(b, 'today', pb.id);
    await expect(
      db
        .insertInto('daily_offers')
        .values({
          tenant_id: b.tenantId,
          workday_id: dayB.id,
          product_id: pa.id,
          initial_quantity: '1',
        })
        .execute(),
    ).rejects.toThrow(/daily_offers_product_fkey/);
  });
});

describe('restricciones de la base', () => {
  it('rechaza cantidades negativas, aumentos en cero y horarios invertidos', async () => {
    const product = await newProduct(a);
    const day = await addOffer(a, 'today', product.id);
    await expect(
      db
        .insertInto('daily_offers')
        .values({
          tenant_id: a.tenantId,
          workday_id: day.id,
          product_id: product.id,
          initial_quantity: '-1',
        })
        .execute(),
    ).rejects.toThrow();
    await expect(
      db
        .insertInto('stock_adjustments')
        .values({
          tenant_id: a.tenantId,
          daily_offer_id: day.offers[0]!.id,
          increment: '0',
          reason: 'x',
          user_id: a.userId,
        })
        .execute(),
    ).rejects.toThrow(/increment/);
    await expect(
      db
        .updateTable('workdays')
        .set({ end_time: sql`'07:00'::time` })
        .where('id', '=', day.id)
        .execute(),
    ).rejects.toThrow(/workdays_hours_order/);
  });
});

describe('sesión', () => {
  it('todas las rutas exigen sesión', async () => {
    const id = '5b2c1a54-7a8e-4a8e-9a55-4b0a1f6d2a10';
    for (const [method, url, payload] of [
      ['GET', '/api/workdays', undefined],
      ['GET', '/api/workdays/today', undefined],
      ['PATCH', '/api/workdays/today', { startTime: '09:00' }],
      ['POST', '/api/workdays/today/offers', { productId: id, quantity: '1' }],
      ['DELETE', `/api/workdays/today/offers/${id}`, undefined],
      ['POST', `/api/workdays/today/offers/${id}/adjustments`, { increment: '1', reason: 'x' }],
    ] as const) {
      const response = await call(null, method, url, payload);
      expect(response.statusCode, `${method} ${url}`).toBe(401);
    }
  });
});
