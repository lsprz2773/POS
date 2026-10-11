import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Database } from '../src/db/client';
import { createTwoTenants, makeApp, resetData, type Session } from './support/app';

let db: Database;
let app: FastifyInstance;
let a: Session;
let b: Session;

beforeAll(async () => {
  db = createDb(process.env.TEST_DATABASE_URL!);
  app = makeApp(db);
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

const get = (s: Session) =>
  app.inject({ method: 'GET', url: '/api/store', headers: { cookie: s.cookie } });
const patch = (s: Session, payload: unknown) =>
  app.inject({
    method: 'PATCH',
    url: '/api/store',
    headers: { cookie: s.cookie },
    payload: payload as object,
  });
const auditOf = (s: Session, action: string) =>
  db
    .selectFrom('audit_events')
    .selectAll()
    .where('tenant_id', '=', s.tenantId)
    .where('entity', '=', 'store_settings')
    .where('action', '=', action)
    .execute();

describe('configuración de la tienda', () => {
  it('devuelve los valores iniciales (MXN, 08:00 a 16:00, lunes a viernes)', async () => {
    const response = await get(a);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      name: 'Tienda A',
      currency: 'MXN',
      timezone: 'America/Mexico_City',
      workdayStart: '08:00',
      workdayEnd: '16:00',
      operatingDays: [1, 2, 3, 4, 5],
    });
  });

  it('actualiza solo lo indicado y deja auditoría con valores anterior y nuevo', async () => {
    const response = await patch(a, {
      name: '  Cooperativa  ',
      operatingDays: [5, 1, 2, 3, 4, 6, 7],
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().name).toBe('Cooperativa');
    expect(response.json().operatingDays).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(response.json().workdayStart).toBe('08:00');

    const events = await auditOf(a, 'update');
    expect(events).toHaveLength(1);
    expect(events[0]!.actor_user_id).toBe(a.userId);
    expect(events[0]!.data).toEqual({
      before: { name: 'Tienda A', operatingDays: [1, 2, 3, 4, 5] },
      after: { name: 'Cooperativa', operatingDays: [1, 2, 3, 4, 5, 6, 7] },
    });
  });

  it('permite cambiar el horario de la jornada', async () => {
    const response = await patch(a, { workdayStart: '07:30', workdayEnd: '14:00' });
    expect(response.statusCode).toBe(200);
    expect((await get(a)).json()).toMatchObject({ workdayStart: '07:30', workdayEnd: '14:00' });
  });

  it('no audita ni modifica si no hay cambios reales', async () => {
    const response = await patch(a, { name: 'Tienda A' });
    expect(response.statusCode).toBe(200);
    expect(await auditOf(a, 'update')).toHaveLength(0);
  });

  it('valida el resultado completo y responde con errores por campo', async () => {
    const response = await patch(a, { workdayEnd: '07:00' });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('validation_error');
    expect(response.json().fields).toHaveProperty('workdayEnd');
    expect((await get(a)).json().workdayEnd).toBe('16:00');
  });

  it.each([
    ['cuerpo vacío', {}],
    ['campo desconocido', { name: 'X', unknown: 1 }],
    ['zona horaria inválida', { timezone: 'Marte/Olimpo' }],
    ['moneda no soportada', { currency: 'USD' }],
    ['días repetidos', { operatingDays: [1, 1] }],
    ['nombre vacío', { name: '   ' }],
  ])('rechaza %s', async (_label, payload) => {
    const response = await patch(a, payload);
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('validation_error');
  });
});

describe('aislamiento entre tiendas', () => {
  it('modificar una tienda no afecta a la otra', async () => {
    await patch(a, { name: 'Solo para A' });
    expect((await get(b)).json().name).toBe('Tienda B');
    expect(await auditOf(b, 'update')).toHaveLength(0);
  });

  it('un tenantId en el cuerpo se rechaza y no cambia nada en la otra tienda', async () => {
    const response = await patch(a, { name: 'Intento', tenantId: b.tenantId });
    expect(response.statusCode).toBe(400);
    expect((await get(b)).json().name).toBe('Tienda B');
    expect((await get(a)).json().name).toBe('Tienda A');
  });

  it('la auditoría de cada tienda solo contiene sus propios eventos', async () => {
    await patch(a, { name: 'Cambio A' });
    await patch(b, { name: 'Cambio B' });
    for (const s of [a, b]) {
      const events = await db
        .selectFrom('audit_events')
        .select('tenant_id')
        .where('action', '=', 'update')
        .where('tenant_id', '=', s.tenantId)
        .execute();
      expect(events).toHaveLength(1);
    }
  });
});
