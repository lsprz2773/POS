import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PendingList, Product, Sale } from '@pos/shared';
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

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
type Line = { method: string; amount: string };

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

const pay = (
  s: Session,
  saleId: string,
  lines: Line[],
  key: string | null = randomUUID(),
  server: FastifyInstance = app,
) =>
  request(
    server,
    s,
    'POST',
    `/api/sales/${saleId}/payments`,
    { lines },
    key === null ? {} : { 'idempotency-key': key },
  );

const voidPay = (s: Session, paymentId: string, reason: unknown = 'Me equivoqué de método') =>
  call(s, 'POST', `/api/payments/${paymentId}/void`, { reason });

/** Producto con existencias hoy, a $25 el tamal. */
async function stocked(s: Session, name: string, quantity = '100', price = '25') {
  const created = await call(s, 'POST', '/api/products', { name, price, cost: '14' });
  const product = created.json<Product>();
  const offer = await call(s, 'POST', '/api/workdays/today/offers', {
    productId: product.id,
    quantity,
  });
  expect(offer.statusCode, offer.body).toBe(201);
  return product;
}

/** Venta de N piezas (a $25 cada una) sin pagos. Total = 25 × N. */
async function sale(
  s: Session,
  productId: string,
  pieces = 2,
  extra: Record<string, unknown> = {},
) {
  const response = await request(
    app,
    s,
    'POST',
    '/api/sales',
    { items: [{ productId, quantity: String(pieces) }], ...extra },
    { 'idempotency-key': randomUUID() },
  );
  expect(response.statusCode, response.body).toBe(201);
  return response.json<Sale>();
}

const cash = (amount: string): Line => ({ method: 'cash', amount });
const transfer = (amount: string): Line => ({ method: 'transfer', amount });

const paymentRows = (s: Session, saleId: string) =>
  db
    .selectFrom('payments')
    .selectAll()
    .where('tenant_id', '=', s.tenantId)
    .where('sale_id', '=', saleId)
    .orderBy('method')
    .execute();

const auditOf = (s: Session, action: string) =>
  db
    .selectFrom('audit_events')
    .selectAll()
    .where('tenant_id', '=', s.tenantId)
    .where('entity', '=', 'payment')
    .where('action', '=', action)
    .orderBy('id')
    .execute();

describe('una venta nueva', () => {
  it('nace pendiente: nada recibido y todo por pagar', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 3);
    expect(created).toMatchObject({
      total: '75.00',
      paid: '0.00',
      balance: '75.00',
      paymentStatus: 'pending',
      settledAt: null,
      payments: [],
    });
  });
});

describe('pago posterior a la venta', () => {
  it('efectivo por el total: queda pagada y registra la fecha de liquidación', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 2);
    const response = await pay(a, created.id, [cash('50')]);
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json<Sale>()).toMatchObject({
      paid: '50.00',
      balance: '0.00',
      paymentStatus: 'paid',
      settledAt: NOW.toISOString(),
      payments: [expect.objectContaining({ method: 'cash', amount: '50.00', status: 'valid' })],
    });
  });

  it('transferencia por el total', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 2);
    const response = await pay(a, created.id, [transfer('50.00')]);
    expect(response.json<Sale>()).toMatchObject({ paymentStatus: 'paid', balance: '0.00' });
    expect(response.json<Sale>().payments[0]).toMatchObject({ method: 'transfer' });
  });

  it('pago mixto: dos renglones de una sola operación, cada importe por su método', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 3); // $75.00
    const response = await pay(a, created.id, [cash('50'), transfer('25')]);
    expect(response.statusCode).toBe(201);
    const result = response.json<Sale>();
    expect(result).toMatchObject({ paid: '75.00', balance: '0.00', paymentStatus: 'paid' });
    expect(result.payments.map((p) => [p.method, p.amount])).toEqual([
      ['cash', '50.00'],
      ['transfer', '25.00'],
    ]);
    expect(result.payments[0]!.operationId).toBe(result.payments[1]!.operationId);
  });

  it('pago parcial: queda parcial con el saldo y sin fecha de liquidación', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 4); // $100.00
    const response = await pay(a, created.id, [cash('30')]);
    expect(response.json<Sale>()).toMatchObject({
      paid: '30.00',
      balance: '70.00',
      paymentStatus: 'partial',
      settledAt: null,
    });
  });

  it('un pago posterior que liquida: acumula varios pagos y la deja pagada', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 4);
    await pay(a, created.id, [cash('30')]);
    await pay(a, created.id, [transfer('20')]);
    const last = await pay(a, created.id, [cash('50')]);
    expect(last.json<Sale>()).toMatchObject({
      paid: '100.00',
      balance: '0.00',
      paymentStatus: 'paid',
      settledAt: NOW.toISOString(),
    });
    expect(last.json<Sale>().payments).toHaveLength(3);
    expect(await paymentRows(a, created.id)).toHaveLength(3);
  });

  it('audita cada operación con el usuario responsable', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 2);
    await pay(a, created.id, [cash('20'), transfer('10')]);
    const [event] = await auditOf(a, 'create');
    expect(event).toMatchObject({
      actor_user_id: a.userId,
      data: {
        saleId: created.id,
        folio: 'V-0001',
        lines: [
          { method: 'cash', amount: '20.00' },
          { method: 'transfer', amount: '10.00' },
        ],
        balanceAfter: '20.00',
        settled: false,
      },
    });
  });

  it('no cambia el total ni los renglones de la venta', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 2);
    await pay(a, created.id, [cash('50')]);
    const after = (await call(a, 'GET', `/api/sales/${created.id}`)).json<Sale>();
    expect(after.total).toBe('50.00');
    expect(after.items).toEqual(created.items);
  });

  it('se puede cobrar una venta de un día anterior', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 2);
    const tomorrow = makeApp(db, { clock: () => NEXT_DAY });
    await tomorrow.ready();
    const response = await pay(a, created.id, [cash('50')], randomUUID(), tomorrow);
    expect(response.statusCode).toBe(201);
    expect(response.json<Sale>()).toMatchObject({
      date: '2026-10-15',
      paymentStatus: 'paid',
      settledAt: NEXT_DAY.toISOString(),
    });
    expect(response.json<Sale>().payments[0]!.createdAt).toBe(NEXT_DAY.toISOString());
    await tomorrow.close();
  });
});

describe('pago al crear la venta', () => {
  const create = (s: Session, items: unknown, extra: Record<string, unknown>, key = randomUUID()) =>
    request(app, s, 'POST', '/api/sales', { items, ...extra }, { 'idempotency-key': key });

  it('la venta nace pagada cuando el pago cubre el total', async () => {
    const tamal = await stocked(a, 'Tamal');
    const response = await create(a, [{ productId: tamal.id, quantity: '2' }], {
      payments: [cash('50')],
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json<Sale>()).toMatchObject({
      total: '50.00',
      paid: '50.00',
      balance: '0.00',
      paymentStatus: 'paid',
      settledAt: NOW.toISOString(),
    });
  });

  it('acepta un pago mixto y uno parcial', async () => {
    const tamal = await stocked(a, 'Tamal');
    const mixed = await create(a, [{ productId: tamal.id, quantity: '2' }], {
      payments: [cash('30'), transfer('20')],
    });
    expect(mixed.json<Sale>()).toMatchObject({ paymentStatus: 'paid' });
    const partial = await create(a, [{ productId: tamal.id, quantity: '4' }], {
      payments: [transfer('40')],
    });
    expect(partial.json<Sale>()).toMatchObject({
      paid: '40.00',
      balance: '60.00',
      paymentStatus: 'partial',
      settledAt: null,
    });
  });

  it('si el pago es de más, no hay venta ni se descuenta inventario', async () => {
    const tamal = await stocked(a, 'Tamal', '10');
    const response = await create(a, [{ productId: tamal.id, quantity: '2' }], {
      payments: [cash('80')],
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().fields.payments).toBe('No puedes cobrar más de $50.00.');
    const day = (await call(a, 'GET', '/api/workdays/today')).json();
    expect(day.offers[0].soldQuantity).toBe('0');
    expect((await call(a, 'GET', '/api/sales/pending')).json().total).toBe(0);
  });

  it('un reintento con la misma llave devuelve la venta con su pago, sin duplicarlo', async () => {
    const tamal = await stocked(a, 'Tamal');
    const key = randomUUID();
    const items = [{ productId: tamal.id, quantity: '2' }];
    const first = await create(a, items, { payments: [cash('50')] }, key);
    const retry = await create(a, items, { payments: [cash('50')] }, key);
    expect(first.statusCode).toBe(201);
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toEqual(first.json());
    expect(await paymentRows(a, first.json<Sale>().id)).toHaveLength(1);
  });

  it('la misma llave con otro pago es un conflicto', async () => {
    const tamal = await stocked(a, 'Tamal');
    const key = randomUUID();
    const items = [{ productId: tamal.id, quantity: '2' }];
    await create(a, items, { payments: [cash('50')] }, key);
    const other = await create(a, items, { payments: [cash('20')] }, key);
    expect(other.statusCode).toBe(409);
    const withoutPayment = await create(a, items, {}, key);
    expect(withoutPayment.statusCode).toBe(409);
  });

  it('un pago inválido al crear se rechaza con errores por campo', async () => {
    const tamal = await stocked(a, 'Tamal');
    const items = [{ productId: tamal.id, quantity: '2' }];
    const zero = await create(a, items, { payments: [cash('0')] });
    expect(zero.statusCode).toBe(400);
    expect(zero.json().fields['payments.0.amount']).toBe('El importe debe ser mayor que cero.');
    expect((await create(a, items, { payments: [] })).statusCode).toBe(400);
    expect(
      (await create(a, items, { payments: [{ method: 'card', amount: '5' }] })).statusCode,
    ).toBe(400);
  });
});

describe('validación de pagos', () => {
  async function pending(total = 3) {
    const tamal = await stocked(a, 'Tamal');
    return sale(a, tamal.id, total); // $25 × total
  }

  it('no deja cobrar más de lo que falta y dice cuánto falta', async () => {
    const created = await pending(3); // $75.00
    const response = await pay(a, created.id, [cash('100')]);
    expect(response.statusCode).toBe(400);
    expect(response.json().fields.lines).toBe('No puedes cobrar más de $75.00.');
    // Con un pago parcial previo, el límite es el saldo actual.
    await pay(a, created.id, [cash('50')]);
    const over = await pay(a, created.id, [cash('30')]);
    expect(over.json().fields.lines).toBe('No puedes cobrar más de $25.00.');
    expect((await call(a, 'GET', `/api/sales/${created.id}`)).json().paid).toBe('50.00');
  });

  it('la suma de un pago mixto también se limita al saldo', async () => {
    const created = await pending(2); // $50.00
    const over = await pay(a, created.id, [cash('30'), transfer('30')]);
    expect(over.statusCode).toBe(400);
    expect(await paymentRows(a, created.id)).toHaveLength(0);
  });

  it('una venta ya pagada no admite otro pago', async () => {
    const created = await pending(2);
    await pay(a, created.id, [cash('50')]);
    const again = await pay(a, created.id, [cash('1')]);
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toBe('Esta venta no tiene saldo por cobrar.');
  });

  it('rechaza importes en cero, negativos, con texto o con más de 2 decimales', async () => {
    const created = await pending();
    const cases: [string, string][] = [
      ['0', 'El importe debe ser mayor que cero.'],
      ['0.00', 'El importe debe ser mayor que cero.'],
      ['-5', 'No puede ser negativo.'],
      ['abc', 'Escribe un importe válido con hasta 2 decimales, por ejemplo 25.50.'],
      ['10.999', 'Escribe un importe válido con hasta 2 decimales, por ejemplo 25.50.'],
    ];
    for (const [amount, message] of cases) {
      const response = await pay(a, created.id, [cash(amount)]);
      expect(response.statusCode, amount).toBe(400);
      expect(response.json().fields['lines.0.amount'], amount).toBe(message);
    }
    expect(
      (await pay(a, created.id, [{ method: 'cash', amount: 5 as unknown as string }])).statusCode,
    ).toBe(400);
  });

  it('solo acepta efectivo o transferencia, sin repetir el método', async () => {
    const created = await pending();
    const card = await pay(a, created.id, [{ method: 'card', amount: '10' }]);
    expect(card.statusCode).toBe(400);
    expect(card.json().fields['lines.0.method']).toBe('Elige efectivo o transferencia.');
    const repeated = await pay(a, created.id, [cash('10'), cash('5')]);
    expect(repeated.statusCode).toBe(400);
    expect(repeated.json().fields['lines.1.method']).toMatch(/Junta los importes/);
    expect((await pay(a, created.id, [])).statusCode).toBe(400);
    expect(
      (await pay(a, created.id, [cash('1'), transfer('1'), { method: 'cash', amount: '1' }]))
        .statusCode,
    ).toBe(400);
  });

  it('rechaza campos que el cliente no decide: estado, fecha, venta, tenant', async () => {
    const created = await pending();
    for (const extra of [
      { status: 'paid' },
      { createdAt: '2020-01-01' },
      { saleId: randomUUID() },
      { tenantId: b.tenantId },
      { total: '0.01' },
    ]) {
      const response = await request(
        app,
        a,
        'POST',
        `/api/sales/${created.id}/payments`,
        { lines: [cash('10')], ...extra },
        { 'idempotency-key': randomUUID() },
      );
      expect(response.statusCode, JSON.stringify(extra)).toBe(400);
    }
    expect(await paymentRows(a, created.id)).toHaveLength(0);
  });

  it('exige una llave de idempotencia válida', async () => {
    const created = await pending();
    const missing = await pay(a, created.id, [cash('10')], null);
    expect(missing.statusCode).toBe(400);
    expect(missing.json().fields.idempotencyKey).toMatch(/Idempotency-Key/);
    expect((await pay(a, created.id, [cash('10')], 'corta')).statusCode).toBe(400);
  });

  it('una venta inexistente o con identificador mal formado no existe', async () => {
    expect((await pay(a, randomUUID(), [cash('10')])).statusCode).toBe(404);
    expect((await pay(a, 'xyz', [cash('10')])).statusCode).toBe(404);
  });
});

describe('reintentos de pago con llave de idempotencia', () => {
  it('la misma llave y el mismo pago devuelven el resultado original sin cobrar dos veces', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 4); // $100.00
    const key = randomUUID();
    const first = await pay(a, created.id, [cash('30')], key);
    const retry = await pay(a, created.id, [cash('30')], key);
    expect(first.statusCode).toBe(201);
    expect(retry.statusCode).toBe(200);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.json()).toEqual(first.json());
    expect(await paymentRows(a, created.id)).toHaveLength(1);
    expect((await call(a, 'GET', `/api/sales/${created.id}`)).json().paid).toBe('30.00');
  });

  it('un pago mixto reintentado tampoco se duplica', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 4);
    const key = randomUUID();
    await pay(a, created.id, [cash('30'), transfer('20')], key);
    const retry = await pay(a, created.id, [transfer('20'), cash('30')], key);
    expect(retry.statusCode).toBe(200);
    expect(await paymentRows(a, created.id)).toHaveLength(2);
  });

  it('la misma llave con otro contenido responde 409 y no cobra nada', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 4);
    const key = randomUUID();
    await pay(a, created.id, [cash('30')], key);
    const other = await pay(a, created.id, [cash('40')], key);
    expect(other.statusCode).toBe(409);
    expect(other.json().error).toMatch(/otra venta distinta|otra venta/);
    const otherSale = await sale(a, tamal.id, 1);
    expect((await pay(a, otherSale.id, [cash('30')], key)).statusCode).toBe(409);
    expect(await paymentRows(a, created.id)).toHaveLength(1);
  });

  it('un reintento tardío devuelve el pago aunque la venta ya esté liquidada', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 2);
    const key = randomUUID();
    const first = await pay(a, created.id, [cash('50')], key);
    const retry = await pay(a, created.id, [cash('50')], key);
    expect(retry.statusCode).toBe(200);
    expect(retry.json().id).toBe(first.json().id);
  });

  it('la llave es por tienda', async () => {
    const [pa, pb] = [await stocked(a, 'A'), await stocked(b, 'B')];
    const [saleA, saleB] = [await sale(a, pa.id, 2), await sale(b, pb.id, 2)];
    const key = randomUUID();
    expect((await pay(a, saleA.id, [cash('50')], key)).statusCode).toBe(201);
    expect((await pay(b, saleB.id, [cash('20')], key)).statusCode).toBe(201);
  });
});

describe('concurrencia en pagos', () => {
  it('dos pagos simultáneos que juntos pasan el saldo: solo uno se registra', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 4); // $100.00
    const results = await Promise.all([
      pay(a, created.id, [cash('70')]),
      pay(a, created.id, [transfer('70')]),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 400]);
    const final = (await call(a, 'GET', `/api/sales/${created.id}`)).json<Sale>();
    expect(final.paid).toBe('70.00');
    expect(final.balance).toBe('30.00');
  });

  it('dos pagos simultáneos que sí caben se registran los dos', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 4);
    const results = await Promise.all([
      pay(a, created.id, [cash('50')]),
      pay(a, created.id, [transfer('50')]),
    ]);
    expect(results.map((r) => r.statusCode)).toEqual([201, 201]);
    expect((await call(a, 'GET', `/api/sales/${created.id}`)).json()).toMatchObject({
      paid: '100.00',
      paymentStatus: 'paid',
    });
  });

  it('el mismo pago enviado dos veces a la vez se cobra una sola vez', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 4);
    const key = randomUUID();
    const results = await Promise.all([
      pay(a, created.id, [cash('40')], key),
      pay(a, created.id, [cash('40')], key),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 201]);
    expect(await paymentRows(a, created.id)).toHaveLength(1);
  });

  it('diez pagos de $10 contra un saldo de $50: exactamente cinco', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 2);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => pay(a, created.id, [cash('10')])),
    );
    expect(results.filter((r) => r.statusCode === 201)).toHaveLength(5);
    expect(await paymentRows(a, created.id)).toHaveLength(5);
    expect((await call(a, 'GET', `/api/sales/${created.id}`)).json().balance).toBe('0.00');
  });
});

describe('anular un pago', () => {
  it('conserva el pago como anulado, devuelve el saldo y deja la venta pendiente', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 2);
    const paid = (await pay(a, created.id, [cash('50')])).json<Sale>();
    const response = await voidPay(a, paid.payments[0]!.id, 'Era transferencia');
    expect(response.statusCode, response.body).toBe(200);
    const result = response.json<Sale>();
    expect(result).toMatchObject({
      paid: '0.00',
      balance: '50.00',
      paymentStatus: 'pending',
      settledAt: null,
    });
    expect(result.payments[0]).toMatchObject({
      status: 'voided',
      amount: '50.00',
      voidReason: 'Era transferencia',
      voidedAt: NOW.toISOString(),
    });
    const [event] = await auditOf(a, 'void');
    expect(event).toMatchObject({
      actor_user_id: a.userId,
      data: {
        saleId: created.id,
        method: 'cash',
        amount: '50.00',
        reason: 'Era transferencia',
        balanceAfter: '50.00',
      },
    });
  });

  it('anular uno de dos pagos deja la venta parcial; el otro sigue vigente', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 2);
    const paid = (await pay(a, created.id, [cash('30'), transfer('20')])).json<Sale>();
    const cashPayment = paid.payments.find((p) => p.method === 'cash')!;
    const result = (await voidPay(a, cashPayment.id)).json<Sale>();
    expect(result).toMatchObject({
      paid: '20.00',
      balance: '30.00',
      paymentStatus: 'partial',
      settledAt: null,
    });
    expect(result.payments.map((p) => [p.method, p.status])).toEqual([
      ['cash', 'voided'],
      ['transfer', 'valid'],
    ]);
  });

  it('después de anular se puede volver a cobrar; el pago anulado no cuenta', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 2);
    const paid = (await pay(a, created.id, [cash('50')])).json<Sale>();
    await voidPay(a, paid.payments[0]!.id);
    const again = await pay(a, created.id, [transfer('50')]);
    expect(again.statusCode).toBe(201);
    expect(again.json<Sale>()).toMatchObject({ paid: '50.00', paymentStatus: 'paid' });
    expect(again.json<Sale>().payments).toHaveLength(2);
  });

  it('exige un motivo y no se puede anular dos veces', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 2);
    const paid = (await pay(a, created.id, [cash('50')])).json<Sale>();
    const id = paid.payments[0]!.id;

    expect((await voidPay(a, id, '')).json().fields.reason).toBe(
      'Escribe el motivo de la anulación.',
    );
    expect((await voidPay(a, id, '   ')).statusCode).toBe(400);
    expect((await call(a, 'POST', `/api/payments/${id}/void`, {})).statusCode).toBe(400);
    expect((await voidPay(a, id, 'x'.repeat(201))).statusCode).toBe(400);
    expect(
      (await call(a, 'POST', `/api/payments/${id}/void`, { reason: 'x', status: 'valid' }))
        .statusCode,
    ).toBe(400);
    expect((await call(a, 'GET', `/api/sales/${created.id}`)).json().paid).toBe('50.00');

    expect((await voidPay(a, id)).statusCode).toBe(200);
    const twice = await voidPay(a, id);
    expect(twice.statusCode).toBe(409);
    expect(twice.json().error).toBe('Este pago ya estaba anulado.');
  });

  it('un pago inexistente o con identificador mal formado no existe', async () => {
    expect((await voidPay(a, randomUUID())).statusCode).toBe(404);
    expect((await voidPay(a, 'xyz')).statusCode).toBe(404);
  });
});

describe('ventas canceladas', () => {
  it('no admiten pagos nuevos ni anular los existentes', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 4);
    const paid = (await pay(a, created.id, [cash('30')])).json<Sale>();
    await db
      .updateTable('sales')
      .set({ status: 'cancelled' })
      .where('id', '=', created.id)
      .execute();

    const newPayment = await pay(a, created.id, [cash('10')]);
    expect(newPayment.statusCode).toBe(409);
    expect(newPayment.json().error).toMatch(/cancelada/);
    const voided = await voidPay(a, paid.payments[0]!.id);
    expect(voided.statusCode).toBe(409);
    expect(voided.json().error).toMatch(/cancelada/);

    const view = (await call(a, 'GET', `/api/sales/${created.id}`)).json<Sale>();
    expect(view.paymentStatus).toBe('cancelled');
    // Los pagos se conservan.
    expect(view.payments).toHaveLength(1);
    expect(view.payments[0]!.status).toBe('valid');
  });
});

describe('ventas pendientes', () => {
  async function setup() {
    const tamal = await stocked(a, 'Tamal');
    const unpaid = await sale(a, tamal.id, 3, { customerReference: 'Grupo 3B' }); // 75.00
    const partial = await sale(a, tamal.id, 4); // 100.00
    await pay(a, partial.id, [cash('40')]);
    const paid = await sale(a, tamal.id, 2);
    await pay(a, paid.id, [cash('50')]);
    return { tamal, unpaid, partial, paid };
  }

  it('lista las ventas con saldo, con el total pendiente, y no las pagadas', async () => {
    const { unpaid, partial, paid } = await setup();
    const body = (await call(a, 'GET', '/api/sales/pending')).json<PendingList>();
    expect(body.total).toBe(2);
    expect(body.totalBalance).toBe('135.00'); // 75 + 60
    expect(body.items.map((s) => s.id).sort()).toEqual([unpaid.id, partial.id].sort());
    expect(body.items.map((s) => s.id)).not.toContain(paid.id);
    const partialItem = body.items.find((s) => s.id === partial.id)!;
    expect(partialItem).toMatchObject({
      folio: 'V-0002',
      date: '2026-10-15',
      total: '100.00',
      paid: '40.00',
      balance: '60.00',
      paymentStatus: 'partial',
    });
    expect(body.items.find((s) => s.id === unpaid.id)).toMatchObject({
      customerReference: 'Grupo 3B',
      paid: '0.00',
      paymentStatus: 'pending',
    });
  });

  it('una venta liquidada sale de pendientes y una pago anulado la devuelve', async () => {
    const { unpaid } = await setup();
    const settled = (await pay(a, unpaid.id, [cash('75')])).json<Sale>();
    expect((await call(a, 'GET', '/api/sales/pending')).json().total).toBe(1);
    await voidPay(a, settled.payments[0]!.id);
    const body = (await call(a, 'GET', '/api/sales/pending')).json<PendingList>();
    expect(body.total).toBe(2);
    expect(body.totalBalance).toBe('135.00');
  });

  it('las pendientes de días anteriores siguen apareciendo', async () => {
    const { unpaid } = await setup();
    const tomorrow = makeApp(db, { clock: () => NEXT_DAY });
    await tomorrow.ready();
    const body = (await request(tomorrow, a, 'GET', '/api/sales/pending')).json<PendingList>();
    expect(body.total).toBe(2);
    expect(body.items.find((s) => s.id === unpaid.id)!.date).toBe('2026-10-15');
    await tomorrow.close();
  });

  it('filtra por fecha de venta, pagina y rechaza rangos inválidos', async () => {
    await setup();
    const day = (query: string) => call(a, 'GET', `/api/sales/pending${query}`);
    expect((await day('?from=2026-10-15&to=2026-10-15')).json().total).toBe(2);
    expect((await day('?from=2026-10-16')).json().total).toBe(0);
    expect((await day('?to=2026-10-14')).json().total).toBe(0);
    const page = (await day('?limit=1&offset=1')).json<PendingList>();
    expect(page.items).toHaveLength(1);
    expect(page).toMatchObject({ total: 2, totalBalance: '135.00', limit: 1, offset: 1 });
    expect((await day('?from=2026-10-16&to=2026-10-15')).statusCode).toBe(400);
    expect((await day('?from=ayer')).statusCode).toBe(400);
    expect((await day('?limit=500')).statusCode).toBe(400);
  });

  it('sin ventas pendientes responde cero, no un error', async () => {
    const body = (await call(a, 'GET', '/api/sales/pending')).json<PendingList>();
    expect(body).toMatchObject({ items: [], total: 0, totalBalance: '0.00' });
  });

  it('no incluye ventas canceladas', async () => {
    const { unpaid } = await setup();
    await db
      .updateTable('sales')
      .set({ status: 'cancelled' })
      .where('id', '=', unpaid.id)
      .execute();
    const body = (await call(a, 'GET', '/api/sales/pending')).json<PendingList>();
    expect(body.items.map((s) => s.id)).not.toContain(unpaid.id);
    expect(body.total).toBe(1);
  });
});

describe('aislamiento entre tiendas', () => {
  it('B no puede cobrar ni ver pagos de una venta de A', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 2);
    const paid = (await pay(a, created.id, [cash('20')])).json<Sale>();

    const attempt = await pay(b, created.id, [cash('10')]);
    expect(attempt.statusCode).toBe(404);
    expect(attempt.json().error).toBe('Esa venta ya no está disponible.');
    expect((await call(b, 'GET', `/api/sales/${created.id}`)).statusCode).toBe(404);
    expect(await paymentRows(a, created.id)).toHaveLength(1);
    expect(paid.balance).toBe('30.00');
  });

  it('B no puede anular un pago de A', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 2);
    const paid = (await pay(a, created.id, [cash('50')])).json<Sale>();
    const attempt = await voidPay(b, paid.payments[0]!.id);
    expect(attempt.statusCode).toBe(404);
    expect(attempt.json().error).toBe('Ese pago ya no está disponible.');
    expect((await call(a, 'GET', `/api/sales/${created.id}`)).json().paymentStatus).toBe('paid');
    expect(await auditOf(b, 'void')).toHaveLength(0);
  });

  it('las pendientes de cada tienda son solo suyas', async () => {
    const [pa, pb] = [await stocked(a, 'A'), await stocked(b, 'B')];
    await sale(a, pa.id, 2);
    await sale(b, pb.id, 4);
    expect((await call(a, 'GET', '/api/sales/pending')).json()).toMatchObject({
      total: 1,
      totalBalance: '50.00',
    });
    expect((await call(b, 'GET', '/api/sales/pending')).json()).toMatchObject({
      total: 1,
      totalBalance: '100.00',
    });
  });

  it('la base impide un pago de una tienda sobre una venta de otra', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 2);
    await expect(
      db
        .insertInto('payments')
        .values({
          tenant_id: b.tenantId,
          sale_id: created.id,
          operation_id: randomUUID(),
          method: 'cash',
          amount: '10.00',
          created_by: b.userId,
          idempotency_key: randomUUID(),
          request_hash: 'a'.repeat(64),
        })
        .execute(),
    ).rejects.toThrow(/payments_sale_fkey/);
  });
});

describe('los pagos no se borran ni se editan', () => {
  async function onePayment() {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 2);
    const paid = (await pay(a, created.id, [cash('50')])).json<Sale>();
    return { saleId: created.id, paymentId: paid.payments[0]!.id };
  }

  it('la base rechaza editar el importe, el método o la venta', async () => {
    const { paymentId } = await onePayment();
    for (const change of [
      { amount: '1.00' },
      { method: 'transfer' as const },
      { created_at: new Date() },
    ]) {
      await expect(
        db.updateTable('payments').set(change).where('id', '=', paymentId).execute(),
        JSON.stringify(change),
      ).rejects.toThrow(/no se edita/);
    }
  });

  it('la base rechaza borrar un pago', async () => {
    const { paymentId } = await onePayment();
    await expect(db.deleteFrom('payments').where('id', '=', paymentId).execute()).rejects.toThrow(
      /no se borra/,
    );
  });

  it('un pago anulado no se puede reactivar ni cambiar su motivo', async () => {
    const { paymentId } = await onePayment();
    await voidPay(a, paymentId, 'Motivo original');
    await expect(
      db
        .updateTable('payments')
        .set({ status: 'valid', void_reason: null, voided_at: null, voided_by: null })
        .where('id', '=', paymentId)
        .execute(),
    ).rejects.toThrow();
    await expect(
      db
        .updateTable('payments')
        .set({ void_reason: 'Otro motivo' })
        .where('id', '=', paymentId)
        .execute(),
    ).rejects.toThrow(/no se modifica/);
  });

  it('la base exige motivo para anular y rechaza importes en cero', async () => {
    const { paymentId, saleId } = await onePayment();
    await expect(
      db.updateTable('payments').set({ status: 'voided' }).where('id', '=', paymentId).execute(),
    ).rejects.toThrow(/payments_void_consistency/);
    await expect(
      db
        .insertInto('payments')
        .values({
          tenant_id: a.tenantId,
          sale_id: saleId,
          operation_id: randomUUID(),
          method: 'transfer',
          amount: '0.00',
          created_by: a.userId,
          idempotency_key: randomUUID(),
          request_hash: 'a'.repeat(64),
        })
        .execute(),
    ).rejects.toThrow(/amount/);
  });

  it('no existen rutas para editar ni borrar pagos', async () => {
    const { paymentId } = await onePayment();
    expect((await call(a, 'DELETE', `/api/payments/${paymentId}`)).statusCode).toBe(404);
    expect((await call(a, 'PATCH', `/api/payments/${paymentId}`, { amount: '1' })).statusCode).toBe(
      404,
    );
  });
});

describe('sesión', () => {
  it('todas las rutas de pagos exigen sesión', async () => {
    const id = randomUUID();
    for (const [method, url, payload] of [
      ['POST', `/api/sales/${id}/payments`, { lines: [cash('1')] }],
      ['POST', `/api/payments/${id}/void`, { reason: 'x' }],
      ['GET', '/api/sales/pending', undefined],
    ] as const) {
      const response = await request(app, null, method, url, payload, {
        'idempotency-key': randomUUID(),
      });
      expect(response.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it('una solicitud desde otro origen se rechaza', async () => {
    const tamal = await stocked(a, 'Tamal');
    const created = await sale(a, tamal.id, 2);
    const response = await app.inject({
      method: 'POST',
      url: `/api/sales/${created.id}/payments`,
      headers: {
        cookie: a.cookie,
        origin: 'https://sitio-malo.test',
        'idempotency-key': randomUUID(),
      },
      payload: { lines: [cash('10')] },
    });
    expect(response.statusCode).toBe(403);
    expect(await paymentRows(a, created.id)).toHaveLength(0);
  });
});
