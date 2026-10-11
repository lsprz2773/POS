import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Product } from '@pos/shared';
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

const call = (
  s: Session | null,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: unknown,
) =>
  app.inject({
    method,
    url,
    headers: s ? { cookie: s.cookie } : {},
    ...(payload === undefined ? {} : { payload: payload as object }),
  });

const tamal = { name: 'Tamal de rajas', price: '25', cost: '14' };

async function create(s: Session, payload: Record<string, unknown> = tamal): Promise<Product> {
  const response = await call(s, 'POST', '/api/products', payload);
  expect(response.statusCode, response.body).toBe(201);
  return response.json<Product>();
}

const auditOf = (s: Session, action?: string) => {
  let query = db
    .selectFrom('audit_events')
    .selectAll()
    .where('tenant_id', '=', s.tenantId)
    .where('entity', '=', 'product')
    .orderBy('id');
  if (action) query = query.where('action', '=', action);
  return query.execute();
};

describe('crear producto', () => {
  it('guarda importes con 2 decimales, unidad "pieza", activo y versión 1', async () => {
    const response = await call(a, 'POST', '/api/products', { ...tamal, price: '25.5' });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      name: 'Tamal de rajas',
      price: '25.50',
      cost: '14.00',
      unit: 'pieza',
      allowsFractions: false,
      description: null,
      category: null,
      code: null,
      notes: null,
      active: true,
      version: 1,
    });
    expect(response.json<Product>().id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('acepta los datos opcionales (RF-022) y costo 0', async () => {
    const product = await create(a, {
      name: 'Agua',
      price: '12',
      cost: '0',
      description: '600 ml',
      category: 'Bebidas',
      code: 'AGU-01',
      unit: 'botella',
      notes: 'Del refri',
    });
    expect(product).toMatchObject({
      cost: '0.00',
      description: '600 ml',
      category: 'Bebidas',
      code: 'AGU-01',
      unit: 'botella',
      notes: 'Del refri',
    });
  });

  it('registra la auditoría con el usuario responsable', async () => {
    const product = await create(a);
    const events = await auditOf(a, 'create');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      entity_id: product.id,
      actor_user_id: a.userId,
      data: { name: 'Tamal de rajas', price: '25.00', cost: '14.00' },
    });
  });

  it('rechaza precio negativo, costo faltante o negativo y nombre vacío con errores por campo', async () => {
    const negativePrice = await call(a, 'POST', '/api/products', { ...tamal, price: '-1' });
    expect(negativePrice.statusCode).toBe(400);
    expect(negativePrice.json().fields).toEqual({ price: 'No puede ser negativo.' });

    const noCost = await call(a, 'POST', '/api/products', { name: 'X', price: '1' });
    expect(noCost.statusCode).toBe(400);
    expect(Object.keys(noCost.json().fields)).toEqual(['cost']);

    const negativeCost = await call(a, 'POST', '/api/products', { ...tamal, cost: '-0.01' });
    expect(negativeCost.json().fields.cost).toBe('No puede ser negativo.');

    const noName = await call(a, 'POST', '/api/products', { ...tamal, name: '  ' });
    expect(noName.json().fields.name).toBe('Escribe el nombre del producto.');

    const text = await call(a, 'POST', '/api/products', { ...tamal, price: 'abc' });
    expect(text.json().fields.price).toMatch(/importe válido/);

    const tooLong = await call(a, 'POST', '/api/products', { ...tamal, notes: 'x'.repeat(501) });
    expect(tooLong.json().fields.notes).toBe('Máximo 500 caracteres.');

    expect((await call(a, 'GET', '/api/products?status=all')).json().total).toBe(0);
  });

  it('un tenantId enviado por el cliente se rechaza y no cambia la tienda autorizada', async () => {
    const response = await call(a, 'POST', '/api/products', { ...tamal, tenantId: b.tenantId });
    expect(response.statusCode).toBe(400);
    expect((await call(b, 'GET', '/api/products?status=all')).json().total).toBe(0);
    expect((await call(a, 'GET', '/api/products?status=all')).json().total).toBe(0);
  });
});

describe('listar y buscar', () => {
  beforeEach(async () => {
    await create(a, { name: 'Tamal de rajas', price: '25', cost: '14', code: 'TAM-01' });
    await create(a, { name: 'Jugo de naranja', price: '18', cost: '9.5', code: 'JUG-01' });
    await create(a, { name: 'Agua 600 ml', price: '12', cost: '7' });
  });

  it('ordena por nombre sin distinguir mayúsculas y da el total', async () => {
    const body = (await call(a, 'GET', '/api/products')).json();
    expect(body.items.map((p: Product) => p.name)).toEqual([
      'Agua 600 ml',
      'Jugo de naranja',
      'Tamal de rajas',
    ]);
    expect(body).toMatchObject({ total: 3, limit: 50, offset: 0 });
  });

  it('busca por nombre o por código, sin distinguir mayúsculas', async () => {
    const byName = (await call(a, 'GET', '/api/products?q=TAMAL')).json();
    expect(byName.items.map((p: Product) => p.code)).toEqual(['TAM-01']);
    const byCode = (await call(a, 'GET', '/api/products?q=jug-0')).json();
    expect(byCode.items.map((p: Product) => p.name)).toEqual(['Jugo de naranja']);
  });

  it('trata % y _ como texto literal', async () => {
    expect((await call(a, 'GET', '/api/products?q=%25')).json().total).toBe(0);
    expect((await call(a, 'GET', '/api/products?q=_')).json().total).toBe(0);
  });

  it('pagina con límite y desplazamiento', async () => {
    const page = (await call(a, 'GET', '/api/products?limit=2&offset=2')).json();
    expect(page.items.map((p: Product) => p.name)).toEqual(['Tamal de rajas']);
    expect(page).toMatchObject({ total: 3, limit: 2, offset: 2 });
  });

  it('filtra por activos, inactivos o todos', async () => {
    const [first] = (await call(a, 'GET', '/api/products')).json<{ items: Product[] }>().items;
    await call(a, 'PATCH', `/api/products/${first!.id}`, {
      version: first!.version,
      active: false,
    });

    expect((await call(a, 'GET', '/api/products')).json().total).toBe(2);
    const inactive = (await call(a, 'GET', '/api/products?status=inactive')).json();
    expect(inactive.items.map((p: Product) => p.name)).toEqual(['Agua 600 ml']);
    expect((await call(a, 'GET', '/api/products?status=all')).json().total).toBe(3);
  });

  it('rechaza parámetros fuera de rango', async () => {
    expect((await call(a, 'GET', '/api/products?limit=500')).statusCode).toBe(400);
    expect((await call(a, 'GET', '/api/products?status=borrados')).statusCode).toBe(400);
  });
});

describe('consultar un producto', () => {
  it('devuelve el producto de la tienda', async () => {
    const product = await create(a);
    const response = await call(a, 'GET', `/api/products/${product.id}`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(product);
  });

  it('un identificador inexistente o mal formado responde igual: no está disponible', async () => {
    const missing = await call(a, 'GET', '/api/products/5b2c1a54-7a8e-4a8e-9a55-4b0a1f6d2a10');
    expect(missing.statusCode).toBe(404);
    expect(missing.json().code).toBe('not_found');
    const malformed = await call(a, 'GET', '/api/products/no-es-un-uuid');
    expect(malformed.statusCode).toBe(404);
    expect(malformed.json().code).toBe('not_found');
  });
});

describe('editar, activar y desactivar', () => {
  it('actualiza solo lo indicado, sube la versión y audita valor anterior y nuevo', async () => {
    const product = await create(a);
    const response = await call(a, 'PATCH', `/api/products/${product.id}`, {
      version: 1,
      price: '27.5',
      notes: 'Sin picante',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      name: 'Tamal de rajas',
      price: '27.50',
      cost: '14.00',
      notes: 'Sin picante',
      version: 2,
    });
    const [event] = await auditOf(a, 'update');
    expect(event).toMatchObject({
      entity_id: product.id,
      actor_user_id: a.userId,
      data: {
        before: { price: '25.00', notes: null },
        after: { price: '27.50', notes: 'Sin picante' },
      },
    });
  });

  it('un cambio que no cambia nada no sube la versión ni deja auditoría', async () => {
    const product = await create(a);
    const response = await call(a, 'PATCH', `/api/products/${product.id}`, {
      version: 1,
      name: 'Tamal de rajas',
      price: '25.00',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().version).toBe(1);
    expect(await auditOf(a, 'update')).toHaveLength(0);
  });

  it('limpia un opcional con null o texto vacío', async () => {
    const product = await create(a, { ...tamal, code: 'TAM-01', category: 'Comida' });
    const response = await call(a, 'PATCH', `/api/products/${product.id}`, {
      version: 1,
      code: null,
      category: '',
    });
    expect(response.json()).toMatchObject({ code: null, category: null, version: 2 });
  });

  it('activar y desactivar se auditan aparte y no borran el producto', async () => {
    const product = await create(a);
    const off = await call(a, 'PATCH', `/api/products/${product.id}`, {
      version: 1,
      active: false,
    });
    expect(off.json()).toMatchObject({ active: false, version: 2 });
    const on = await call(a, 'PATCH', `/api/products/${product.id}`, { version: 2, active: true });
    expect(on.json()).toMatchObject({ active: true, version: 3 });

    expect(await auditOf(a, 'deactivate')).toHaveLength(1);
    expect(await auditOf(a, 'activate')).toHaveLength(1);
    expect((await call(a, 'GET', `/api/products/${product.id}`)).statusCode).toBe(200);
  });

  it('un producto desactivado se sigue consultando y se puede reactivar', async () => {
    const product = await create(a);
    await call(a, 'PATCH', `/api/products/${product.id}`, { version: 1, active: false });
    const fetched = await call(a, 'GET', `/api/products/${product.id}`);
    expect(fetched.json()).toMatchObject({ id: product.id, active: false });
  });

  it('con una versión vieja responde 409 y no pisa el cambio de la otra sesión', async () => {
    const product = await create(a);
    await call(a, 'PATCH', `/api/products/${product.id}`, { version: 1, price: '30' });

    const stale = await call(a, 'PATCH', `/api/products/${product.id}`, {
      version: 1,
      price: '99',
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().code).toBe('conflict');
    expect(stale.json().error).toMatch(/cambió mientras lo editabas/);

    const current = (await call(a, 'GET', `/api/products/${product.id}`)).json();
    expect(current).toMatchObject({ price: '30.00', version: 2 });
  });

  it('dos ediciones simultáneas con la misma versión: solo una se aplica', async () => {
    const product = await create(a);
    const results = await Promise.all([
      call(a, 'PATCH', `/api/products/${product.id}`, { version: 1, price: '30' }),
      call(a, 'PATCH', `/api/products/${product.id}`, { version: 1, price: '40' }),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect((await call(a, 'GET', `/api/products/${product.id}`)).json().version).toBe(2);
  });

  it('exige versión, rechaza campos desconocidos y valores inválidos', async () => {
    const product = await create(a);
    const url = `/api/products/${product.id}`;
    expect((await call(a, 'PATCH', url, { price: '30' })).statusCode).toBe(400);
    expect((await call(a, 'PATCH', url, { version: 1 })).statusCode).toBe(400);
    expect((await call(a, 'PATCH', url, { version: 1, tenantId: b.tenantId })).statusCode).toBe(
      400,
    );
    expect((await call(a, 'PATCH', url, { version: 1, id: b.tenantId })).statusCode).toBe(400);
    const negative = await call(a, 'PATCH', url, { version: 1, cost: '-3' });
    expect(negative.json().fields.cost).toBe('No puede ser negativo.');
    expect((await call(a, 'GET', url)).json()).toMatchObject({ version: 1, cost: '14.00' });
  });
});

describe('código interno', () => {
  it('no se repite en la tienda, sin distinguir mayúsculas, con error en el campo', async () => {
    await create(a, { ...tamal, code: 'TAM-01' });
    const response = await call(a, 'POST', '/api/products', {
      ...tamal,
      name: 'Otro',
      code: 'tam-01',
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'conflict',
      fields: { code: 'Ya existe un producto con ese código.' },
    });
  });

  it('al editar tampoco se puede repetir, y el producto queda como estaba', async () => {
    await create(a, { ...tamal, code: 'TAM-01' });
    const other = await create(a, { ...tamal, name: 'Otro', code: 'OTR-01' });
    const response = await call(a, 'PATCH', `/api/products/${other.id}`, {
      version: 1,
      code: 'TAM-01',
    });
    expect(response.statusCode).toBe(409);
    expect((await call(a, 'GET', `/api/products/${other.id}`)).json()).toMatchObject({
      code: 'OTR-01',
      version: 1,
    });
  });

  it('la misma clave en otra tienda sí es válida', async () => {
    await create(a, { ...tamal, code: 'TAM-01' });
    await create(b, { ...tamal, code: 'TAM-01' });
  });

  it('varios productos sin código no chocan entre sí', async () => {
    await create(a, tamal);
    await create(a, { ...tamal, name: 'Otro' });
  });
});

describe('aislamiento entre tiendas', () => {
  it('B no puede leer, editar ni listar productos de A', async () => {
    const product = await create(a, { ...tamal, code: 'TAM-01' });

    expect((await call(b, 'GET', `/api/products/${product.id}`)).statusCode).toBe(404);

    const patch = await call(b, 'PATCH', `/api/products/${product.id}`, { version: 1, price: '1' });
    expect(patch.statusCode).toBe(404);

    expect((await call(b, 'GET', '/api/products?status=all')).json().total).toBe(0);
    expect((await call(b, 'GET', '/api/products?q=tamal&status=all')).json().total).toBe(0);
    expect((await call(b, 'GET', '/api/products?q=TAM-01&status=all')).json().total).toBe(0);

    expect((await call(a, 'GET', `/api/products/${product.id}`)).json()).toMatchObject({
      price: '25.00',
      version: 1,
    });
    expect(await auditOf(b)).toHaveLength(0);
  });

  it('B no puede desactivar un producto de A', async () => {
    const product = await create(a);
    const response = await call(b, 'PATCH', `/api/products/${product.id}`, {
      version: 1,
      active: false,
    });
    expect(response.statusCode).toBe(404);
    expect((await call(a, 'GET', `/api/products/${product.id}`)).json().active).toBe(true);
  });

  it('cada tienda ve solo sus productos', async () => {
    await create(a, { ...tamal, name: 'De A' });
    await create(b, { ...tamal, name: 'De B' });
    expect(
      (await call(a, 'GET', '/api/products')).json().items.map((p: Product) => p.name),
    ).toEqual(['De A']);
    expect(
      (await call(b, 'GET', '/api/products')).json().items.map((p: Product) => p.name),
    ).toEqual(['De B']);
  });
});

describe('sin borrado y con sesión', () => {
  it('no existe forma de borrar un producto', async () => {
    const product = await create(a);
    const response = await call(a, 'DELETE', `/api/products/${product.id}`);
    expect(response.statusCode).toBe(404);
    expect((await call(a, 'GET', `/api/products/${product.id}`)).statusCode).toBe(200);
  });

  it('todas las rutas exigen sesión', async () => {
    const id = '5b2c1a54-7a8e-4a8e-9a55-4b0a1f6d2a10';
    for (const [method, url, payload] of [
      ['GET', '/api/products', undefined],
      ['POST', '/api/products', tamal],
      ['GET', `/api/products/${id}`, undefined],
      ['PATCH', `/api/products/${id}`, { version: 1, active: false }],
    ] as const) {
      const response = await call(null, method, url, payload);
      expect(response.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it('una solicitud que modifica datos desde otro origen se rechaza', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/products',
      headers: { cookie: a.cookie, origin: 'https://sitio-malo.test' },
      payload: tamal,
    });
    expect(response.statusCode).toBe(403);
  });
});
