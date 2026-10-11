import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Product, Sale, Workday, WorkdayList } from '@pos/shared';
import { createDb, type Database } from '../src/db/client';
import { createTwoTenants, makeApp, resetData, type Session } from './support/app';

// Jueves 15 de octubre de 2026, 12:00 en la Ciudad de México (dentro del horario 08:00 a 16:00).
const NOW = new Date('2026-10-15T18:00:00Z');
const TODAY = '2026-10-15';

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

const sell = (
  s: Session,
  items: { productId: string; quantity: string }[],
  extra: Record<string, unknown> = {},
  key: string | null = randomUUID(),
  server: FastifyInstance = app,
) =>
  request(
    server,
    s,
    'POST',
    '/api/sales',
    { items, ...extra },
    key === null ? {} : { 'idempotency-key': key },
  );

async function newProduct(s: Session, name: string, price = '25', cost = '14') {
  const response = await call(s, 'POST', '/api/products', { name, price, cost });
  expect(response.statusCode, response.body).toBe(201);
  return response.json<Product>();
}

/** Producto del catálogo ya incluido en la jornada de hoy con su cantidad inicial. */
async function stocked(s: Session, name: string, quantity: string, price = '25', cost = '14') {
  const product = await newProduct(s, name, price, cost);
  const response = await call(s, 'POST', '/api/workdays/today/offers', {
    productId: product.id,
    quantity,
  });
  expect(response.statusCode, response.body).toBe(201);
  return product;
}

const available = async (s: Session, productId: string) => {
  const day = (await call(s, 'GET', '/api/workdays/today')).json<Workday>();
  return day.offers.find((o) => o.productId === productId)!;
};

const salesOf = (s: Session) =>
  db.selectFrom('sales').selectAll().where('tenant_id', '=', s.tenantId).orderBy('folio').execute();

describe('crear una venta', () => {
  it('calcula totales en el backend, descuenta el inventario y devuelve el folio', async () => {
    const tamal = await stocked(a, 'Tamal de rajas', '40', '25', '14');
    const jugo = await stocked(a, 'Jugo de naranja', '30', '18', '9.5');

    const response = await sell(
      a,
      [
        { productId: tamal.id, quantity: '2' },
        { productId: jugo.id, quantity: '1' },
      ],
      { customerReference: 'Mtra. Ana', note: 'Para el recreo' },
    );
    expect(response.statusCode, response.body).toBe(201);
    const sale = response.json<Sale>();
    expect(sale).toMatchObject({
      folio: 'V-0001',
      folioNumber: 1,
      date: TODAY,
      status: 'active',
      customerReference: 'Mtra. Ana',
      note: 'Para el recreo',
      total: '68.00',
      outsideWorkdayHours: false,
    });
    expect(sale.items).toEqual([
      expect.objectContaining({
        productName: 'Tamal de rajas',
        quantity: '2',
        unitPrice: '25.00',
        subtotal: '50.00',
      }),
      expect.objectContaining({
        productName: 'Jugo de naranja',
        quantity: '1',
        unitPrice: '18.00',
        subtotal: '18.00',
      }),
    ]);
    expect(await available(a, tamal.id)).toMatchObject({
      initialQuantity: '40',
      soldQuantity: '2',
      availableQuantity: '38',
    });
    expect(await available(a, jugo.id)).toMatchObject({
      soldQuantity: '1',
      availableQuantity: '29',
    });

    const fetched = await call(a, 'GET', `/api/sales/${sale.id}`);
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json()).toEqual(sale);
  });

  it('el folio es consecutivo y un intento fallido no gasta número', async () => {
    const tamal = await stocked(a, 'Tamal', '3');
    const first = await sell(a, [{ productId: tamal.id, quantity: '1' }]);
    const tooMany = await sell(a, [{ productId: tamal.id, quantity: '9' }]);
    const second = await sell(a, [{ productId: tamal.id, quantity: '1' }]);
    expect(first.json().folio).toBe('V-0001');
    expect(tooMany.statusCode).toBe(409);
    expect(second.json().folio).toBe('V-0002');
  });

  it('guarda auditoría con el usuario responsable', async () => {
    const tamal = await stocked(a, 'Tamal', '10');
    const sale = (await sell(a, [{ productId: tamal.id, quantity: '2' }])).json<Sale>();
    const events = await db
      .selectFrom('audit_events')
      .selectAll()
      .where('tenant_id', '=', a.tenantId)
      .where('entity', '=', 'sale')
      .execute();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      entity_id: sale.id,
      action: 'create',
      actor_user_id: a.userId,
      data: { folio: 'V-0001', date: TODAY, total: '50.00', items: 1 },
    });
  });

  it('un producto con fracciones admite cantidades decimales exactas', async () => {
    const queso = await newProduct(a, 'Queso por kilo', '120');
    await db
      .updateTable('products')
      .set({ allows_fractions: true, unit: 'kg' })
      .where('id', '=', queso.id)
      .execute();
    await call(a, 'POST', '/api/workdays/today/offers', { productId: queso.id, quantity: '5' });
    const sale = (await sell(a, [{ productId: queso.id, quantity: '0.333' }])).json<Sale>();
    expect(sale.items[0]).toMatchObject({ quantity: '0.333', subtotal: '39.96' });
    expect(sale.total).toBe('39.96');
    expect((await available(a, queso.id)).availableQuantity).toBe('4.667');
  });

  it('avisa si la venta es fuera del horario de la jornada, pero la registra', async () => {
    const tamal = await stocked(a, 'Tamal', '10');
    // 23:30 UTC = 17:30 en la Ciudad de México, después de las 16:00.
    const late = makeApp(db, { clock: () => new Date('2026-10-15T23:30:00Z') });
    await late.ready();
    const response = await sell(
      a,
      [{ productId: tamal.id, quantity: '1' }],
      {},
      randomUUID(),
      late,
    );
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ outsideWorkdayHours: true, total: '25.00' });
    await late.close();
  });
});

describe('precio, costo y nombre congelados', () => {
  it('cambiar el catálogo después no altera ventas ya hechas', async () => {
    const tamal = await stocked(a, 'Tamal', '10', '25', '14');
    const sale = (await sell(a, [{ productId: tamal.id, quantity: '2' }])).json<Sale>();

    await call(a, 'PATCH', `/api/products/${tamal.id}`, {
      version: 1,
      name: 'Tamal de mole',
      price: '40',
      cost: '30',
    });

    const fetched = (await call(a, 'GET', `/api/sales/${sale.id}`)).json<Sale>();
    expect(fetched.total).toBe('50.00');
    expect(fetched.items[0]).toMatchObject({
      productName: 'Tamal',
      unitPrice: '25.00',
      subtotal: '50.00',
    });
    const stored = await db
      .selectFrom('sale_items')
      .select(['unit_cost', 'unit_price'])
      .where('sale_id', '=', sale.id)
      .executeTakeFirstOrThrow();
    expect(stored).toMatchObject({ unit_cost: '14.00', unit_price: '25.00' });

    // La siguiente venta ya usa el precio nuevo.
    const next = (await sell(a, [{ productId: tamal.id, quantity: '1' }])).json<Sale>();
    expect(next.items[0]).toMatchObject({ productName: 'Tamal de mole', unitPrice: '40.00' });
  });

  it('el cliente no puede mandar precio, costo, subtotales ni total', async () => {
    const tamal = await stocked(a, 'Tamal', '10');
    const line = { productId: tamal.id, quantity: '1' };
    for (const payload of [
      { items: [{ ...line, price: '0.01' }] },
      { items: [{ ...line, unitPrice: '0.01' }] },
      { items: [{ ...line, subtotal: '0.01' }] },
      { items: [line], total: '0.01' },
      { items: [line], tenantId: b.tenantId },
      { items: [line], status: 'cancelled' },
      { items: [line], folio: 99 },
    ]) {
      const response = await request(app, a, 'POST', '/api/sales', payload, {
        'idempotency-key': randomUUID(),
      });
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
    }
    expect(await salesOf(a)).toHaveLength(0);
  });
});

describe('validación de la venta', () => {
  it('exige al menos un producto y cantidades mayores que cero', async () => {
    const tamal = await stocked(a, 'Tamal', '10');
    const none = await sell(a, []);
    expect(none.statusCode).toBe(400);
    expect(none.json().fields.items).toBe('Agrega al menos un producto.');

    const zero = await sell(a, [{ productId: tamal.id, quantity: '0' }]);
    expect(zero.json().fields['items.0.quantity']).toBe('Escribe una cantidad mayor que cero.');
    const negative = await sell(a, [{ productId: tamal.id, quantity: '-2' }]);
    expect(negative.json().fields['items.0.quantity']).toBe('No puede ser negativa.');
    expect(
      (await request(app, a, 'POST', '/api/sales', {}, { 'idempotency-key': randomUUID() }))
        .statusCode,
    ).toBe(400);
  });

  it('rechaza el mismo producto en dos renglones', async () => {
    const tamal = await stocked(a, 'Tamal', '10');
    const response = await sell(a, [
      { productId: tamal.id, quantity: '1' },
      { productId: tamal.id, quantity: '2' },
    ]);
    expect(response.statusCode).toBe(400);
    expect(response.json().fields['items.1.productId']).toMatch(/repetido/);
  });

  it('rechaza productos que no están en la disponibilidad de hoy', async () => {
    await stocked(a, 'Tamal', '10');
    const outside = await newProduct(a, 'Fuera del día');
    const unknown = randomUUID();
    const response = await sell(a, [
      { productId: outside.id, quantity: '1' },
      { productId: unknown, quantity: '1' },
    ]);
    expect(response.statusCode).toBe(400);
    expect(response.json().fields).toEqual({
      'items.0.productId': 'Ese producto no está en la disponibilidad de hoy.',
      'items.1.productId': 'Ese producto no está en la disponibilidad de hoy.',
    });
  });

  it('rechaza un producto desactivado después de preparar el día', async () => {
    const tamal = await stocked(a, 'Tamal', '10');
    await call(a, 'PATCH', `/api/products/${tamal.id}`, { version: 1, active: false });
    const response = await sell(a, [{ productId: tamal.id, quantity: '1' }]);
    expect(response.statusCode).toBe(400);
    expect(response.json().fields['items.0.productId']).toBe('Este producto está desactivado.');
  });

  it('un producto por pieza no admite fracciones', async () => {
    const tamal = await stocked(a, 'Tamal', '10');
    const response = await sell(a, [{ productId: tamal.id, quantity: '1.5' }]);
    expect(response.statusCode).toBe(400);
    expect(response.json().fields['items.0.quantity']).toBe(
      'Este producto se vende en piezas enteras.',
    );
  });

  it('pide preparar el día cuando hoy no tiene productos', async () => {
    const product = await newProduct(a, 'Tamal');
    const response = await sell(a, [{ productId: product.id, quantity: '1' }]);
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/Prepara el día/);
  });

  it('exige una llave de idempotencia válida', async () => {
    const tamal = await stocked(a, 'Tamal', '10');
    const items = [{ productId: tamal.id, quantity: '1' }];
    const missing = await sell(a, items, {}, null);
    expect(missing.statusCode).toBe(400);
    expect(missing.json().fields.idempotencyKey).toMatch(/Idempotency-Key/);
    for (const key of ['corta', 'con espacios no vale', 'x'.repeat(129)]) {
      expect((await sell(a, items, {}, key)).statusCode, key).toBe(400);
    }
    expect(await salesOf(a)).toHaveLength(0);
  });

  it('recorta espacios en cliente y nota, y respeta los límites', async () => {
    const tamal = await stocked(a, 'Tamal', '10');
    const items = [{ productId: tamal.id, quantity: '1' }];
    const sale = (await sell(a, items, { customerReference: '  Ana  ', note: '   ' })).json<Sale>();
    expect(sale.customerReference).toBe('Ana');
    expect(sale.note).toBeNull();
    expect((await sell(a, items, { customerReference: 'x'.repeat(101) })).statusCode).toBe(400);
    expect((await sell(a, items, { note: 'x'.repeat(501) })).statusCode).toBe(400);
  });
});

describe('inventario insuficiente', () => {
  it('rechaza toda la venta e indica el producto afectado', async () => {
    const tamal = await stocked(a, 'Tamal', '10');
    const empanada = await stocked(a, 'Empanada de piña', '4');
    const response = await sell(a, [
      { productId: tamal.id, quantity: '3' },
      { productId: empanada.id, quantity: '6' },
    ]);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'insufficient_stock',
      fields: { 'items.1.quantity': 'Solo quedan 4 de Empanada de piña.' },
    });
    // Nada se vendió, ni siquiera el renglón que sí alcanzaba.
    expect(await salesOf(a)).toHaveLength(0);
    expect((await available(a, tamal.id)).soldQuantity).toBe('0');
  });

  it('un producto agotado lo dice con claridad', async () => {
    const tamal = await stocked(a, 'Tamal', '2');
    expect((await sell(a, [{ productId: tamal.id, quantity: '2' }])).statusCode).toBe(201);
    const response = await sell(a, [{ productId: tamal.id, quantity: '1' }]);
    expect(response.statusCode).toBe(409);
    expect(response.json().fields['items.0.quantity']).toBe('Tamal está agotado.');
  });

  it('se puede vender exactamente lo que queda, y un aumento reabre la venta', async () => {
    const tamal = await stocked(a, 'Tamal', '5');
    expect((await sell(a, [{ productId: tamal.id, quantity: '5' }])).statusCode).toBe(201);
    expect((await available(a, tamal.id)).availableQuantity).toBe('0');
    expect((await sell(a, [{ productId: tamal.id, quantity: '1' }])).statusCode).toBe(409);

    const offer = await available(a, tamal.id);
    await call(a, 'POST', `/api/workdays/today/offers/${offer.id}/adjustments`, {
      increment: '3',
      reason: 'Llegó más producto',
    });
    expect((await sell(a, [{ productId: tamal.id, quantity: '3' }])).statusCode).toBe(201);
    expect(await available(a, tamal.id)).toMatchObject({
      initialQuantity: '5',
      adjustedQuantity: '3',
      soldQuantity: '8',
      availableQuantity: '0',
    });
  });
});

describe('reintentos con llave de idempotencia', () => {
  it('la misma llave y el mismo contenido devuelven la venta original sin duplicar', async () => {
    const tamal = await stocked(a, 'Tamal', '10');
    const key = randomUUID();
    const items = [{ productId: tamal.id, quantity: '2' }];

    const first = await sell(a, items, { note: 'x' }, key);
    const retry = await sell(a, items, { note: 'x' }, key);
    expect(first.statusCode).toBe(201);
    expect(retry.statusCode).toBe(200);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.json()).toEqual(first.json());
    expect(first.headers['idempotent-replayed']).toBeUndefined();

    expect(await salesOf(a)).toHaveLength(1);
    expect((await available(a, tamal.id)).soldQuantity).toBe('2');
  });

  it('el orden de los renglones no cambia el contenido', async () => {
    const [p1, p2] = [await stocked(a, 'Tamal', '10'), await stocked(a, 'Jugo', '10')];
    const key = randomUUID();
    const first = await sell(
      a,
      [
        { productId: p1.id, quantity: '1' },
        { productId: p2.id, quantity: '2' },
      ],
      {},
      key,
    );
    const retry = await sell(
      a,
      [
        { productId: p2.id, quantity: '2' },
        { productId: p1.id, quantity: '1' },
      ],
      {},
      key,
    );
    expect(retry.statusCode).toBe(200);
    expect(retry.json().id).toBe(first.json().id);
  });

  it('la misma llave con otro contenido responde 409 y no vende nada', async () => {
    const tamal = await stocked(a, 'Tamal', '10');
    const key = randomUUID();
    await sell(a, [{ productId: tamal.id, quantity: '2' }], {}, key);
    const other = await sell(a, [{ productId: tamal.id, quantity: '3' }], {}, key);
    expect(other.statusCode).toBe(409);
    expect(other.json().code).toBe('conflict');
    expect(other.json().error).toMatch(/otra venta distinta/);
    expect(await salesOf(a)).toHaveLength(1);
    expect((await available(a, tamal.id)).soldQuantity).toBe('2');
  });

  it('un reintento tardío devuelve la venta aunque el inventario ya se haya agotado', async () => {
    const tamal = await stocked(a, 'Tamal', '2');
    const key = randomUUID();
    const first = await sell(a, [{ productId: tamal.id, quantity: '2' }], {}, key);
    expect((await sell(a, [{ productId: tamal.id, quantity: '1' }])).statusCode).toBe(409);
    const retry = await sell(a, [{ productId: tamal.id, quantity: '2' }], {}, key);
    expect(retry.statusCode).toBe(200);
    expect(retry.json().id).toBe(first.json().id);
  });

  it('un reintento sigue funcionando al día siguiente', async () => {
    const tamal = await stocked(a, 'Tamal', '5');
    const key = randomUUID();
    const first = await sell(a, [{ productId: tamal.id, quantity: '1' }], {}, key);
    const tomorrow = makeApp(db, { clock: () => new Date('2026-10-16T18:00:00Z') });
    await tomorrow.ready();
    const retry = await sell(a, [{ productId: tamal.id, quantity: '1' }], {}, key, tomorrow);
    expect(retry.statusCode).toBe(200);
    expect(retry.json().id).toBe(first.json().id);
    await tomorrow.close();
  });

  it('la llave es por tienda: otra tienda puede usar la misma sin chocar', async () => {
    const [pa, pb] = [await stocked(a, 'De A', '5'), await stocked(b, 'De B', '5')];
    const key = randomUUID();
    const saleA = await sell(a, [{ productId: pa.id, quantity: '1' }], {}, key);
    const saleB = await sell(b, [{ productId: pb.id, quantity: '2' }], {}, key);
    expect(saleA.statusCode).toBe(201);
    expect(saleB.statusCode).toBe(201);
    expect(saleB.json().total).toBe('50.00');
    expect(saleB.json().id).not.toBe(saleA.json().id);
  });
});

describe('concurrencia', () => {
  it('dos ventas de la última unidad: solo una tiene éxito', async () => {
    const tamal = await stocked(a, 'Tamal', '1');
    const items = [{ productId: tamal.id, quantity: '1' }];
    const results = await Promise.all([sell(a, items), sell(a, items)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    const loser = results.find((r) => r.statusCode === 409)!;
    expect(loser.json().code).toBe('insufficient_stock');
    expect(await available(a, tamal.id)).toMatchObject({
      soldQuantity: '1',
      availableQuantity: '0',
    });
    expect(await salesOf(a)).toHaveLength(1);
  });

  it('diez ventas contra cinco unidades: exactamente cinco, sin inventario negativo ni folios repetidos', async () => {
    const tamal = await stocked(a, 'Tamal', '5');
    const items = [{ productId: tamal.id, quantity: '1' }];
    const results = await Promise.all(Array.from({ length: 10 }, () => sell(a, items)));
    const codes = results.map((r) => r.statusCode);
    expect(codes.filter((c) => c === 201)).toHaveLength(5);
    expect(codes.filter((c) => c === 409)).toHaveLength(5);
    expect(await available(a, tamal.id)).toMatchObject({
      soldQuantity: '5',
      availableQuantity: '0',
    });
    expect((await salesOf(a)).map((s) => s.folio)).toEqual([1, 2, 3, 4, 5]);
  });

  it('la misma solicitud enviada dos veces a la vez crea una sola venta', async () => {
    const tamal = await stocked(a, 'Tamal', '10');
    const key = randomUUID();
    const items = [{ productId: tamal.id, quantity: '3' }];
    const results = await Promise.all([sell(a, items, {}, key), sell(a, items, {}, key)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 201]);
    expect(results[0]!.json().id).toBe(results[1]!.json().id);
    expect(await salesOf(a)).toHaveLength(1);
    expect((await available(a, tamal.id)).soldQuantity).toBe('3');
  });

  it('ventas simultáneas con productos cruzados no se bloquean entre sí', async () => {
    const [p1, p2] = [await stocked(a, 'Tamal', '50'), await stocked(a, 'Jugo', '50')];
    const forward = [
      { productId: p1.id, quantity: '1' },
      { productId: p2.id, quantity: '1' },
    ];
    const backward = [...forward].reverse();
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => sell(a, i % 2 ? forward : backward)),
    );
    expect(results.every((r) => r.statusCode === 201)).toBe(true);
    expect((await available(a, p1.id)).soldQuantity).toBe('8');
  });
});

describe('la jornada refleja las ventas', () => {
  it('muestra vendido y disponible por producto y en el resumen de jornadas', async () => {
    const tamal = await stocked(a, 'Tamal', '40');
    await sell(a, [{ productId: tamal.id, quantity: '18' }]);
    const list = (await call(a, 'GET', '/api/workdays')).json<WorkdayList>();
    expect(list.items[0]).toMatchObject({
      initialQuantity: '40',
      soldQuantity: '18',
      availableQuantity: '22',
    });
  });

  it('un producto con ventas no se puede quitar del día', async () => {
    const tamal = await stocked(a, 'Tamal', '10');
    await sell(a, [{ productId: tamal.id, quantity: '1' }]);
    const offer = await available(a, tamal.id);
    const response = await call(a, 'DELETE', `/api/workdays/today/offers/${offer.id}`);
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/ya tiene ventas/);
    expect((await available(a, tamal.id)).soldQuantity).toBe('1');
  });

  it('las ventas canceladas dejan de descontar inventario', async () => {
    const tamal = await stocked(a, 'Tamal', '10');
    const sale = (await sell(a, [{ productId: tamal.id, quantity: '4' }])).json<Sale>();
    expect((await available(a, tamal.id)).availableQuantity).toBe('6');
    await db.updateTable('sales').set({ status: 'cancelled' }).where('id', '=', sale.id).execute();
    expect(await available(a, tamal.id)).toMatchObject({
      soldQuantity: '0',
      availableQuantity: '10',
    });
    // Aunque la venta esté cancelada, el historial se conserva: el producto no se puede quitar.
    const offer = await available(a, tamal.id);
    const removal = await call(a, 'DELETE', `/api/workdays/today/offers/${offer.id}`);
    expect(removal.statusCode).toBe(409);
    expect(removal.json().error).toMatch(/ya tiene ventas/);
  });
});

describe('las ventas confirmadas no se borran ni se editan', () => {
  async function oneSale() {
    const tamal = await stocked(a, 'Tamal', '10');
    return (await sell(a, [{ productId: tamal.id, quantity: '2' }])).json<Sale>();
  }

  it('la base rechaza editar datos de la venta', async () => {
    const sale = await oneSale();
    for (const change of [
      { total: '1.00' },
      { folio: 99 },
      { note: 'cambiada' },
      { customer_reference: 'otro' },
    ]) {
      await expect(
        db.updateTable('sales').set(change).where('id', '=', sale.id).execute(),
        JSON.stringify(change),
      ).rejects.toThrow(/no se edita/);
    }
  });

  it('la base rechaza borrar la venta y editar o borrar sus renglones', async () => {
    const sale = await oneSale();
    await expect(db.deleteFrom('sales').where('id', '=', sale.id).execute()).rejects.toThrow(
      /no se borra/,
    );
    await expect(
      db.updateTable('sale_items').set({ quantity: '99' }).where('sale_id', '=', sale.id).execute(),
    ).rejects.toThrow(/no se editan ni se borran/);
    await expect(
      db.deleteFrom('sale_items').where('sale_id', '=', sale.id).execute(),
    ).rejects.toThrow(/no se editan ni se borran/);
    expect((await call(a, 'GET', `/api/sales/${sale.id}`)).json().total).toBe('50.00');
  });

  it('solo el estado puede cambiar (lo usará la cancelación)', async () => {
    const sale = await oneSale();
    await db.updateTable('sales').set({ status: 'cancelled' }).where('id', '=', sale.id).execute();
    expect((await call(a, 'GET', `/api/sales/${sale.id}`)).json().status).toBe('cancelled');
  });

  it('no existen rutas para editar ni borrar ventas', async () => {
    const sale = await oneSale();
    expect((await call(a, 'DELETE', `/api/sales/${sale.id}`)).statusCode).toBe(404);
    expect((await call(a, 'PATCH', `/api/sales/${sale.id}`, { total: '1' })).statusCode).toBe(404);
  });

  it('la base impide mezclar tiendas en renglones y ventas', async () => {
    const tamalA = await stocked(a, 'Tamal A', '10');
    const tamalB = await stocked(b, 'Tamal B', '10');
    const saleA = (await sell(a, [{ productId: tamalA.id, quantity: '1' }])).json<Sale>();
    const offerB = await available(b, tamalB.id);
    // Un renglón de la tienda B apuntando a una venta de A viola la llave compuesta.
    await expect(
      db
        .insertInto('sale_items')
        .values({
          tenant_id: b.tenantId,
          sale_id: saleA.id,
          position: 9,
          daily_offer_id: offerB.id,
          product_id: tamalB.id,
          product_name: 'x',
          quantity: '1',
          unit_price: '1.00',
          unit_cost: '1.00',
          subtotal: '1.00',
        })
        .execute(),
    ).rejects.toThrow(/sale_items_sale_fkey/);
    await expect(
      db.updateTable('sales').set({ tenant_id: b.tenantId }).where('id', '=', saleA.id).execute(),
    ).rejects.toThrow();
  });
});

describe('aislamiento entre tiendas', () => {
  it('B no puede consultar una venta de A', async () => {
    const tamal = await stocked(a, 'Tamal', '10');
    const sale = (await sell(a, [{ productId: tamal.id, quantity: '1' }])).json<Sale>();
    const response = await call(b, 'GET', `/api/sales/${sale.id}`);
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('Esa venta ya no está disponible.');
    expect((await call(b, 'GET', '/api/sales/no-es-un-uuid')).statusCode).toBe(404);
  });

  it('B no puede vender productos de A, aunque conozca su identificador', async () => {
    const tamalA = await stocked(a, 'Tamal A', '10');
    await stocked(b, 'Tamal B', '10');
    const response = await sell(b, [{ productId: tamalA.id, quantity: '1' }]);
    expect(response.statusCode).toBe(400);
    expect(response.json().fields['items.0.productId']).toBe(
      'Ese producto no está en la disponibilidad de hoy.',
    );
    expect(await salesOf(a)).toHaveLength(0);
    expect((await available(a, tamalA.id)).soldQuantity).toBe('0');
  });

  it('cada tienda lleva su propio folio y su propio inventario', async () => {
    const [pa, pb] = [await stocked(a, 'Tamal', '10'), await stocked(b, 'Tamal', '10')];
    await sell(a, [{ productId: pa.id, quantity: '1' }]);
    await sell(a, [{ productId: pa.id, quantity: '1' }]);
    const first = await sell(b, [{ productId: pb.id, quantity: '4' }]);
    expect(first.json().folio).toBe('V-0001');
    expect((await available(a, pa.id)).soldQuantity).toBe('2');
    expect((await available(b, pb.id)).soldQuantity).toBe('4');
  });
});

describe('sesión', () => {
  it('las rutas de ventas exigen sesión', async () => {
    const id = randomUUID();
    for (const [method, url, payload] of [
      ['POST', '/api/sales', { items: [{ productId: id, quantity: '1' }] }],
      ['GET', `/api/sales/${id}`, undefined],
    ] as const) {
      const response = await request(app, null, method, url, payload, {
        'idempotency-key': randomUUID(),
      });
      expect(response.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it('una solicitud desde otro origen se rechaza', async () => {
    const tamal = await stocked(a, 'Tamal', '10');
    const response = await app.inject({
      method: 'POST',
      url: '/api/sales',
      headers: {
        cookie: a.cookie,
        origin: 'https://sitio-malo.test',
        'idempotency-key': randomUUID(),
      },
      payload: { items: [{ productId: tamal.id, quantity: '1' }] },
    });
    expect(response.statusCode).toBe(403);
    expect(await salesOf(a)).toHaveLength(0);
  });
});
