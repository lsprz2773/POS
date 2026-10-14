import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type Dashboard,
  type Product,
  type Sale,
  type Workday,
  type WorkdayList,
} from '@pos/shared';
import { createDb, type Database } from '../src/db/client';
import { addSeller, createTwoTenants, makeApp, resetData, type Session } from './support/app';

// Jueves 15 de octubre de 2026, 12:00 en la Ciudad de México.
const NOW = new Date('2026-10-15T18:00:00Z');

let db: Database;
let app: FastifyInstance;
let a: Session;
let b: Session;
let vera: Session;
let raul: Session;
let sofia: Session;

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
  vera = await addSeller(app, db, a.tenantId, 'vera@tienda-a.test');
  raul = await addSeller(app, db, a.tenantId, 'raul@tienda-a.test');
  sofia = await addSeller(app, db, b.tenantId, 'sofia@tienda-b.test');
});

const call = (
  s: Session,
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  payload?: unknown,
  headers: Record<string, string> = {},
) =>
  app.inject({
    method,
    url,
    headers: { cookie: s.cookie, ...headers },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });

async function product(s: Session, name = 'Tamal'): Promise<Product> {
  const response = await call(s, 'POST', '/api/products', { name, price: '25', cost: '14' });
  expect(response.statusCode, response.body).toBe(201);
  return response.json<Product>();
}

async function prepare(s: Session, productId: string, quantity: string) {
  const response = await call(s, 'POST', '/api/workdays/today/offers', { productId, quantity });
  expect(response.statusCode, response.body).toBe(201);
  return response.json<Workday>();
}

const sellRequest = (s: Session, productId: string, pieces: number) =>
  call(
    s,
    'POST',
    '/api/sales',
    { items: [{ productId, quantity: String(pieces) }] },
    { 'idempotency-key': randomUUID() },
  );

async function sell(s: Session, productId: string, pieces: number) {
  const response = await sellRequest(s, productId, pieces);
  expect(response.statusCode, response.body).toBe(201);
  return response.json<Sale>();
}

const today = async (s: Session, query = '') =>
  (await call(s, 'GET', `/api/workdays/today${query}`)).json<Workday>();

describe('cada persona prepara su propio día', () => {
  it('dos personas preparan el mismo producto el mismo día con cantidades distintas sin afectarse', async () => {
    const tamal = await product(a);
    await prepare(a, tamal.id, '50');
    await prepare(vera, tamal.id, '10');
    await prepare(raul, tamal.id, '5');

    const [owner, v, r] = [await today(a), await today(vera), await today(raul)];
    expect(owner.offers.map((o) => o.initialQuantity)).toEqual(['50']);
    expect(v.offers.map((o) => o.initialQuantity)).toEqual(['10']);
    expect(r.offers.map((o) => o.initialQuantity)).toEqual(['5']);
    // La jornada es una sola por tienda y fecha.
    expect(new Set([owner.id, v.id, r.id]).size).toBe(1);
    const rows = await db
      .selectFrom('workdays')
      .select('id')
      .where('tenant_id', '=', a.tenantId)
      .execute();
    expect(rows).toHaveLength(1);
  });

  it('el mismo producto dos veces en el día de la misma persona sigue siendo un conflicto', async () => {
    const tamal = await product(a);
    await prepare(vera, tamal.id, '10');
    const again = await call(vera, 'POST', '/api/workdays/today/offers', {
      productId: tamal.id,
      quantity: '3',
    });
    expect(again.statusCode).toBe(409);
  });

  it('un vendedor sin día preparado ve la jornada vacía y no puede vender', async () => {
    const tamal = await product(a);
    await prepare(a, tamal.id, '10');
    expect((await today(vera)).offers).toEqual([]);

    const response = await sellRequest(vera, tamal.id, 1);
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      fields: { 'items.0.productId': 'Ese producto no está en la disponibilidad de hoy.' },
    });
  });

  it('un vendedor solo vende lo que preparó', async () => {
    const tamal = await product(a);
    const atole = await product(a, 'Atole');
    await prepare(vera, tamal.id, '10');
    expect((await sellRequest(vera, atole.id, 1)).statusCode).toBe(400);
    expect((await sellRequest(vera, tamal.id, 1)).statusCode).toBe(201);
  });

  it('cada quien descuenta su propia disponibilidad', async () => {
    const tamal = await product(a);
    await prepare(a, tamal.id, '3');
    await prepare(vera, tamal.id, '8');

    await sell(a, tamal.id, 3);
    expect((await sellRequest(a, tamal.id, 1)).statusCode).toBe(409); // el propietario agotó lo suyo
    await sell(vera, tamal.id, 5); // la de la vendedora sigue intacta

    expect((await today(a)).offers[0]).toMatchObject({ soldQuantity: '3', availableQuantity: '0' });
    expect((await today(vera)).offers[0]).toMatchObject({
      soldQuantity: '5',
      availableQuantity: '3',
    });
  });

  it('cancelar una venta restituye la disponibilidad de quien la hizo, no la de otra persona', async () => {
    const tamal = await product(a);
    await prepare(a, tamal.id, '10');
    await prepare(vera, tamal.id, '10');
    const sale = await sell(vera, tamal.id, 4);
    expect((await today(vera)).offers[0]!.availableQuantity).toBe('6');

    const cancelled = await call(vera, 'POST', `/api/sales/${sale.id}/cancel`, {
      reason: 'Me equivoqué',
    });
    expect(cancelled.statusCode, cancelled.body).toBe(200);
    expect((await today(vera)).offers[0]!.availableQuantity).toBe('10');
    expect((await today(a)).offers[0]!.availableQuantity).toBe('10');
  });

  it('dos ventas simultáneas sobre la última pieza de la misma persona: solo una pasa', async () => {
    const tamal = await product(a);
    await prepare(vera, tamal.id, '1');
    const [one, two] = await Promise.all([
      sellRequest(vera, tamal.id, 1),
      sellRequest(vera, tamal.id, 1),
    ]);
    expect([one.statusCode, two.statusCode].sort()).toEqual([201, 409]);
    expect((await today(vera)).offers[0]).toMatchObject({
      soldQuantity: '1',
      availableQuantity: '0',
    });
  });

  it('un vendedor no puede quitar ni aumentar el producto del día de otra persona', async () => {
    const tamal = await product(a);
    const ownerDay = await prepare(a, tamal.id, '10');
    const offerId = ownerDay.offers[0]!.id;

    const remove = await call(vera, 'DELETE', `/api/workdays/today/offers/${offerId}`);
    expect(remove.statusCode).toBe(404);
    const adjust = await call(vera, 'POST', `/api/workdays/today/offers/${offerId}/adjustments`, {
      increment: '5',
      reason: 'Prueba',
    });
    expect(adjust.statusCode).toBe(404);
    expect((await today(a)).offers[0]).toMatchObject({
      initialQuantity: '10',
      adjustedQuantity: '0',
    });
  });

  it('sus propios productos sí se aumentan y se quitan', async () => {
    const tamal = await product(a);
    const day = await prepare(vera, tamal.id, '10');
    const offerId = day.offers[0]!.id;
    const adjust = await call(vera, 'POST', `/api/workdays/today/offers/${offerId}/adjustments`, {
      increment: '5',
      reason: 'Sobró masa',
    });
    expect(adjust.statusCode, adjust.body).toBe(201);
    expect((await today(vera)).offers[0]!.availableQuantity).toBe('15');
    expect((await call(vera, 'DELETE', `/api/workdays/today/offers/${offerId}`)).statusCode).toBe(
      200,
    );
  });
});

describe('el propietario consulta el día de un vendedor, solo para leer', () => {
  it('con sellerId ve lo que preparó y vendió el vendedor', async () => {
    const tamal = await product(a);
    await prepare(a, tamal.id, '50');
    await prepare(vera, tamal.id, '10');
    await sell(vera, tamal.id, 2);

    const day = await today(a, `?sellerId=${vera.userId}`);
    expect(day.offers).toHaveLength(1);
    expect(day.offers[0]).toMatchObject({
      initialQuantity: '10',
      soldQuantity: '2',
      availableQuantity: '8',
    });
    const list = (
      await call(a, 'GET', `/api/workdays?sellerId=${vera.userId}`)
    ).json<WorkdayList>();
    expect(list.items[0]).toMatchObject({ products: 1, initialQuantity: '10', soldQuantity: '2' });
  });

  it('un vendedor no puede pedir el día de otra persona', async () => {
    const response = await call(vera, 'GET', `/api/workdays/today?sellerId=${raul.userId}`);
    expect(response.statusCode).toBe(403);
    // Su propio identificador sí se acepta.
    expect(
      (await call(vera, 'GET', `/api/workdays/today?sellerId=${vera.userId}`)).statusCode,
    ).toBe(404); // sin nada preparado hoy: el día aún no existe
  });

  it('una persona de otra tienda responde como inexistente y un identificador mal formado, 400', async () => {
    const tamal = await product(a);
    await prepare(a, tamal.id, '10');
    expect((await call(a, 'GET', `/api/workdays/today?sellerId=${sofia.userId}`)).statusCode).toBe(
      404,
    );
    expect((await call(a, 'GET', '/api/workdays/today?sellerId=no-es-uuid')).statusCode).toBe(400);
  });

  it('aislamiento: la tienda B no ve el día de la tienda A', async () => {
    const tamal = await product(a);
    await prepare(a, tamal.id, '10');
    expect((await call(b, 'GET', '/api/workdays/today')).statusCode).toBe(404);
    expect((await call(sofia, 'GET', '/api/workdays/today')).statusCode).toBe(404);
    expect((await call(sofia, 'GET', '/api/workdays')).json<WorkdayList>().total).toBe(0);
  });
});

describe('día preparado y jornadas anteriores son de cada persona', () => {
  it('el tablero marca como preparado solo el día de quien ya eligió sus productos', async () => {
    const tamal = await product(a);
    await prepare(a, tamal.id, '10');
    expect((await call(a, 'GET', '/api/dashboard')).json<Dashboard>().dayPrepared).toBe(true);
    expect((await call(vera, 'GET', '/api/dashboard')).json<Dashboard>().dayPrepared).toBe(false);
    await prepare(vera, tamal.id, '4');
    expect((await call(vera, 'GET', '/api/dashboard')).json<Dashboard>().dayPrepared).toBe(true);
  });

  it('la lista de jornadas muestra solo los días y las cantidades de la persona', async () => {
    const tamal = await product(a);
    await prepare(a, tamal.id, '50');
    await prepare(vera, tamal.id, '10');
    const owner = (await call(a, 'GET', '/api/workdays')).json<WorkdayList>();
    const seller = (await call(vera, 'GET', '/api/workdays')).json<WorkdayList>();
    expect(owner.items[0]).toMatchObject({ products: 1, initialQuantity: '50' });
    expect(seller.items[0]).toMatchObject({ products: 1, initialQuantity: '10' });
    expect((await call(raul, 'GET', '/api/workdays')).json<WorkdayList>().total).toBe(0);
  });
});

describe('restricciones de la base', () => {
  it('una inserción sin usuario (código anterior) queda a nombre del propietario', async () => {
    const tamal = await product(a);
    const day = await prepare(a, tamal.id, '10');
    const atole = await product(a, 'Atole');
    const inserted = await db
      .insertInto('daily_offers')
      .values({
        tenant_id: a.tenantId,
        workday_id: day.id,
        product_id: atole.id,
        initial_quantity: '4',
      } as never)
      .returning('user_id')
      .executeTakeFirstOrThrow();
    expect(inserted.user_id).toBe(a.userId);
  });

  it('la disponibilidad no puede ser de alguien que no es de la tienda', async () => {
    const tamal = await product(a);
    const day = await prepare(a, tamal.id, '10');
    const atole = await product(a, 'Atole');
    await expect(
      db
        .insertInto('daily_offers')
        .values({
          tenant_id: a.tenantId,
          workday_id: day.id,
          user_id: sofia.userId,
          product_id: atole.id,
          initial_quantity: '4',
        })
        .execute(),
    ).rejects.toThrow(/daily_offers_member_fkey/);
  });

  it('el mismo producto no se repite por persona y jornada', async () => {
    const tamal = await product(a);
    const day = await prepare(vera, tamal.id, '10');
    await expect(
      db
        .insertInto('daily_offers')
        .values({
          tenant_id: a.tenantId,
          workday_id: day.id,
          user_id: vera.userId,
          product_id: tamal.id,
          initial_quantity: '1',
        })
        .execute(),
    ).rejects.toThrow(/daily_offers_workday_user_product_key/);
  });
});
