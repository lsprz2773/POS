import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SELLER_LIMIT,
  type Product,
  type Sale,
  type SalesList,
  type TeamList,
  type TeamMember,
} from '@pos/shared';
import { createDb, type Database } from '../src/db/client';
import type { UserDirectory } from '../src/modules/auth/identity-provider';
import { createTwoTenants, makeApp, resetData, type Session } from './support/app';

// Jueves 15 de octubre de 2026, 12:00 en la Ciudad de México.
const NOW = new Date('2026-10-15T18:00:00Z');
const PASSWORD = 'Contrasena-Larga-1';

let db: Database;
let app: FastifyInstance;
let a: Session;
let b: Session;
/** Llamadas a la administración de cuentas, en orden. */
let calls: string[];
let failDelete = false;
/** Si está puesta, `createUser` espera a que lleguen dos altas antes de seguir (fuerza la carrera). */
let gate: { arrived: number; release: () => void; open: Promise<void> } | null = null;

beforeAll(() => {
  db = createDb(process.env.TEST_DATABASE_URL!);
});

afterAll(async () => {
  await db.destroy();
});

// Las cuentas del proveedor local viven en memoria: cada prueba arranca con su propia aplicación.
beforeEach(async () => {
  calls = [];
  failDelete = false;
  gate = null;
  app = makeApp(db, {
    clock: () => NOW,
    wrapDirectory: (directory): UserDirectory => ({
      createUser: async (email, password) => {
        calls.push(`create:${email}`);
        const created = await directory.createUser(email, password);
        if (gate) {
          gate.arrived += 1;
          if (gate.arrived >= 2) gate.release();
          await gate.open;
        }
        return created;
      },
      disable: async (subject) => {
        calls.push(`disable:${subject}`);
        return directory.disable(subject);
      },
      enable: async (subject) => {
        calls.push(`enable:${subject}`);
        return directory.enable(subject);
      },
      signOutEverywhere: async (subject) => {
        calls.push(`signout:${subject}`);
        return directory.signOutEverywhere(subject);
      },
      deleteUser: async (subject) => {
        calls.push(`delete:${subject}`);
        if (failDelete) throw new Error('no se pudo borrar');
        return directory.deleteUser(subject);
      },
    }),
  });
  await app.ready();
  await resetData(db);
  ({ a, b } = await createTwoTenants(app, db));
});

afterEach(async () => {
  await app.close();
});

const call = (
  s: Pick<Session, 'cookie'> | null,
  method: 'GET' | 'POST' | 'PATCH',
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

const seller = (n: number | string, extra: Record<string, unknown> = {}) => ({
  displayName: `Vendedor ${n}`,
  email: `vendedor${n}@tienda-a.test`,
  password: PASSWORD,
  ...extra,
});

async function addSeller(s: Session, payload: Record<string, unknown>) {
  const response = await call(s, 'POST', '/api/team/sellers', payload);
  expect(response.statusCode, response.body).toBe(201);
  return response.json<TeamMember>();
}

async function login(email: string, password = PASSWORD) {
  const response = await call(null, 'POST', '/api/auth/login', { email, password });
  return {
    status: response.statusCode,
    cookie: response.cookies.map((c) => `${c.name}=${c.value}`).join('; '),
  };
}

describe('alta de un vendedor', () => {
  it('crea la cuenta, aparece en el equipo y entra con la contraseña que registró el propietario', async () => {
    const member = await addSeller(a, seller(1, { email: ' Lucia@Tienda-A.test ' }));
    expect(member).toMatchObject({
      email: 'lucia@tienda-a.test',
      displayName: 'Vendedor 1',
      role: 'seller',
      status: 'active',
    });
    expect(JSON.stringify(member)).not.toContain(PASSWORD);

    const team = (await call(a, 'GET', '/api/team')).json<TeamList>();
    expect(team).toMatchObject({ activeSellers: 1, sellerLimit: SELLER_LIMIT });
    expect(team.items.map((m) => [m.email, m.role])).toEqual([
      ['ana@tienda-a.test', 'owner'],
      ['lucia@tienda-a.test', 'seller'],
    ]);

    const session = await login('lucia@tienda-a.test');
    expect(session.status).toBe(200);
    const me = (await call(session, 'GET', '/api/me')).json();
    expect(me).toMatchObject({
      role: 'seller',
      tenant: { id: a.tenantId },
      user: { email: 'lucia@tienda-a.test' },
    });
  });

  it('guarda quién la invitó y la auditoría, sin la contraseña', async () => {
    const member = await addSeller(a, seller(1));
    const membership = await db
      .selectFrom('memberships')
      .select(['role', 'status', 'invited_by'])
      .where('user_id', '=', member.id)
      .executeTakeFirstOrThrow();
    expect(membership).toEqual({ role: 'seller', status: 'active', invited_by: a.userId });

    const events = await db
      .selectFrom('audit_events')
      .selectAll()
      .where('entity', '=', 'team_member')
      .execute();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      tenant_id: a.tenantId,
      actor_user_id: a.userId,
      action: 'create',
    });
    expect(JSON.stringify(events[0])).not.toContain(PASSWORD);
  });

  it('valida los datos y dice qué corregir', async () => {
    const weak = await call(a, 'POST', '/api/team/sellers', seller(1, { password: 'corta' }));
    expect(weak.statusCode).toBe(400);
    expect(weak.json().fields).toHaveProperty('password');

    const bad = await call(a, 'POST', '/api/team/sellers', {
      displayName: '',
      email: 'sin-arroba',
      password: PASSWORD,
    });
    expect(bad.statusCode).toBe(400);
    expect(Object.keys(bad.json().fields)).toEqual(
      expect.arrayContaining(['displayName', 'email']),
    );
    expect(calls).toEqual([]); // nada llegó al proveedor de identidad
  });

  it('un correo que ya existe responde 409 sin importar mayúsculas, incluso el de otra tienda', async () => {
    await addSeller(a, seller(1));
    const same = await call(
      a,
      'POST',
      '/api/team/sellers',
      seller(1, { email: 'VENDEDOR1@tienda-a.test' }),
    );
    expect(same.statusCode).toBe(409);
    expect(same.json().fields).toHaveProperty('email');
    const otherStore = await call(b, 'POST', '/api/team/sellers', seller(1));
    expect(otherStore.statusCode).toBe(409);
    const owner = await call(
      b,
      'POST',
      '/api/team/sellers',
      seller(1, { email: 'ana@tienda-a.test' }),
    );
    expect(owner.statusCode).toBe(409);
  });

  it('si la base falla después de crear la cuenta, la cuenta se borra', async () => {
    // Un usuario ajeno ya ocupa el identificador que tendrá la cuenta nueva: la inserción falla.
    await db
      .insertInto('users')
      .values({ email: 'otro@tienda-a.test', identity_subject: 'local:vendedor1@tienda-a.test' })
      .execute();
    const response = await call(a, 'POST', '/api/team/sellers', seller(1));
    expect(response.statusCode).toBe(409);
    expect(calls).toEqual([
      'create:vendedor1@tienda-a.test',
      'delete:local:vendedor1@tienda-a.test',
    ]);
    expect((await login('vendedor1@tienda-a.test')).status).toBe(401);
    const members = await db
      .selectFrom('memberships')
      .select('user_id')
      .where('tenant_id', '=', a.tenantId)
      .execute();
    expect(members).toHaveLength(1);
  });

  it('si además no se puede borrar la cuenta, el error original sigue siendo el que se informa', async () => {
    await db
      .insertInto('users')
      .values({ email: 'otro@tienda-a.test', identity_subject: 'local:vendedor1@tienda-a.test' })
      .execute();
    failDelete = true;
    const response = await call(a, 'POST', '/api/team/sellers', seller(1));
    expect(response.statusCode).toBe(409);
  });

  it('un vendedor no puede ver ni gestionar el equipo', async () => {
    await addSeller(a, seller(1));
    const session = await login('vendedor1@tienda-a.test');
    expect((await call(session, 'GET', '/api/team')).statusCode).toBe(403);
    expect((await call(session, 'POST', '/api/team/sellers', seller(2))).statusCode).toBe(403);
    expect(
      (await call(session, 'PATCH', `/api/team/${a.userId}`, { status: 'disabled' })).statusCode,
    ).toBe(403);
    expect(calls).toEqual(['create:vendedor1@tienda-a.test']);
  });

  it('sin sesión responde 401', async () => {
    expect((await call(null, 'GET', '/api/team')).statusCode).toBe(401);
    expect((await call(null, 'POST', '/api/team/sellers', seller(1))).statusCode).toBe(401);
  });
});

describe('tope de vendedores', () => {
  const fill = async (count: number) => {
    for (let n = 1; n <= count; n++) await addSeller(a, seller(n));
  };

  it(`el vendedor ${SELLER_LIMIT + 1} se rechaza con 409 y no toca el proveedor de identidad`, async () => {
    await fill(SELLER_LIMIT);
    calls = [];
    const response = await call(a, 'POST', '/api/team/sellers', seller(99));
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toContain(String(SELLER_LIMIT));
    expect(calls).toEqual([]);
  });

  it('dos altas simultáneas con un solo lugar: solo una pasa y la otra cuenta se borra', async () => {
    await fill(SELLER_LIMIT - 1);
    calls = [];
    let release!: () => void;
    gate = {
      arrived: 0,
      release: () => release(),
      open: new Promise<void>((resolve) => (release = resolve)),
    };
    const [one, two] = await Promise.all([
      call(a, 'POST', '/api/team/sellers', seller(98)),
      call(a, 'POST', '/api/team/sellers', seller(99)),
    ]);
    expect([one.statusCode, two.statusCode].sort()).toEqual([201, 409]);
    expect(calls.filter((c) => c.startsWith('delete:'))).toHaveLength(1);
    expect((await call(a, 'GET', '/api/team')).json<TeamList>().activeSellers).toBe(SELLER_LIMIT);
  });

  it('dar de baja libera un lugar y reactivar respeta el tope', async () => {
    await fill(SELLER_LIMIT);
    const team = (await call(a, 'GET', '/api/team')).json<TeamList>();
    const first = team.items.find((m) => m.role === 'seller')!;
    expect(
      (await call(a, 'PATCH', `/api/team/${first.id}`, { status: 'disabled' })).statusCode,
    ).toBe(200);
    await addSeller(a, seller(99)); // entra en el lugar liberado
    const blocked = await call(a, 'PATCH', `/api/team/${first.id}`, { status: 'active' });
    expect(blocked.statusCode).toBe(409);
    expect(calls.filter((c) => c.startsWith('enable:'))).toEqual([]); // no se habilitó en el proveedor
  });

  it('los vendedores dados de baja no cuentan contra el tope', async () => {
    await addSeller(a, seller(1));
    const team = (await call(a, 'GET', '/api/team')).json<TeamList>();
    await call(a, 'PATCH', `/api/team/${team.items[1]!.id}`, { status: 'disabled' });
    expect((await call(a, 'GET', '/api/team')).json<TeamList>().activeSellers).toBe(0);
  });
});

describe('baja, reactivación y nombre', () => {
  async function stockedSale(s: Session) {
    const product = (
      await call(s, 'POST', '/api/products', { name: 'Tamal', price: '25', cost: '14' })
    ).json<Product>();
    await call(s, 'POST', '/api/workdays/today/offers', { productId: product.id, quantity: '10' });
    const sale = await call(
      s,
      'POST',
      '/api/sales',
      { items: [{ productId: product.id, quantity: '2' }] },
      { 'idempotency-key': randomUUID() },
    );
    expect(sale.statusCode, sale.body).toBe(201);
    return sale.json<Sale>();
  }

  it('la baja bloquea el acceso en su siguiente petición y deshabilita su cuenta', async () => {
    const member = await addSeller(a, seller(1));
    const session = await login('vendedor1@tienda-a.test');
    expect((await call(session, 'GET', '/api/me')).statusCode).toBe(200);

    const response = await call(a, 'PATCH', `/api/team/${member.id}`, { status: 'disabled' });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json<TeamMember>().status).toBe('disabled');
    expect(calls.slice(-2)).toEqual([
      'disable:local:vendedor1@tienda-a.test',
      'signout:local:vendedor1@tienda-a.test',
    ]);

    // Con su sesión vigente ya no puede nada; tampoco puede volver a entrar.
    const blocked = await call(session, 'GET', '/api/me');
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json()).toMatchObject({ code: 'membership_disabled' });
    expect((await login('vendedor1@tienda-a.test')).status).toBe(401);
  });

  it('conserva su historial y al reactivarlo vuelve a entrar', async () => {
    const member = await addSeller(a, seller(1));
    const session = await login('vendedor1@tienda-a.test');
    const product = (
      await call(a, 'POST', '/api/products', { name: 'Tamal', price: '25', cost: '14' })
    ).json<Product>();
    await call(session, 'POST', '/api/workdays/today/offers', {
      productId: product.id,
      quantity: '10',
    });
    const sale = await call(
      session,
      'POST',
      '/api/sales',
      { items: [{ productId: product.id, quantity: '2' }] },
      { 'idempotency-key': randomUUID() },
    );
    expect(sale.statusCode, sale.body).toBe(201);

    await call(a, 'PATCH', `/api/team/${member.id}`, { status: 'disabled' });
    // El propietario sigue viendo su venta.
    expect((await call(a, 'GET', '/api/sales')).json<SalesList>().total).toBe(1);

    const back = await call(a, 'PATCH', `/api/team/${member.id}`, { status: 'active' });
    expect(back.statusCode, back.body).toBe(200);
    expect(calls.at(-1)).toBe('enable:local:vendedor1@tienda-a.test');
    const again = await login('vendedor1@tienda-a.test');
    expect(again.status).toBe(200);
    expect((await call(again, 'GET', '/api/sales')).json<SalesList>().total).toBe(1);
  });

  it('repetir una baja es seguro: vuelve a pedir al proveedor lo que quedó pendiente', async () => {
    const member = await addSeller(a, seller(1));
    await call(a, 'PATCH', `/api/team/${member.id}`, { status: 'disabled' });
    calls = [];
    const again = await call(a, 'PATCH', `/api/team/${member.id}`, { status: 'disabled' });
    expect(again.statusCode).toBe(200);
    expect(calls).toEqual([
      'disable:local:vendedor1@tienda-a.test',
      'signout:local:vendedor1@tienda-a.test',
    ]);
    const events = await db
      .selectFrom('audit_events')
      .select('action')
      .where('entity', '=', 'team_member')
      .execute();
    expect(events.map((e) => e.action)).toEqual(['create', 'disable']); // sin evento duplicado
  });

  it('cambia el nombre y lo audita; sin cambios no hay evento', async () => {
    const member = await addSeller(a, seller(1));
    const renamed = await call(a, 'PATCH', `/api/team/${member.id}`, {
      displayName: '  Lucía López ',
    });
    expect(renamed.json<TeamMember>().displayName).toBe('Lucía López');
    await call(a, 'PATCH', `/api/team/${member.id}`, { displayName: 'Lucía López' });
    const events = await db
      .selectFrom('audit_events')
      .select('action')
      .where('entity', '=', 'team_member')
      .orderBy('id')
      .execute();
    expect(events.map((e) => e.action)).toEqual(['create', 'rename']);
  });

  it('rechaza cambios vacíos, estados desconocidos y al propietario', async () => {
    const member = await addSeller(a, seller(1));
    expect((await call(a, 'PATCH', `/api/team/${member.id}`, {})).statusCode).toBe(400);
    expect(
      (await call(a, 'PATCH', `/api/team/${member.id}`, { status: 'borrado' })).statusCode,
    ).toBe(400);
    const owner = await call(a, 'PATCH', `/api/team/${a.userId}`, { status: 'disabled' });
    expect(owner.statusCode).toBe(409);
    expect((await call(a, 'GET', '/api/me')).statusCode).toBe(200);
  });

  it('un identificador mal formado o inexistente responde 404', async () => {
    expect(
      (await call(a, 'PATCH', '/api/team/no-es-uuid', { status: 'disabled' })).statusCode,
    ).toBe(404);
    expect(
      (await call(a, 'PATCH', `/api/team/${randomUUID()}`, { status: 'disabled' })).statusCode,
    ).toBe(404);
  });

  it('la baja no toca el historial de ventas del propietario', async () => {
    const member = await addSeller(a, seller(1));
    await stockedSale(a);
    await call(a, 'PATCH', `/api/team/${member.id}`, { status: 'disabled' });
    expect((await call(a, 'GET', '/api/sales')).json<SalesList>().total).toBe(1);
  });
});

describe('aislamiento entre tiendas', () => {
  it('cada propietario solo ve y gestiona a su propio equipo', async () => {
    const mine = await addSeller(a, seller(1));
    const theirs = await call(b, 'POST', '/api/team/sellers', {
      displayName: 'Mario',
      email: 'mario@tienda-b.test',
      password: PASSWORD,
    });
    expect(theirs.statusCode, theirs.body).toBe(201);
    const theirId = theirs.json<TeamMember>().id;

    const teamB = (await call(b, 'GET', '/api/team')).json<TeamList>();
    expect(teamB.items.map((m) => m.email).sort()).toEqual([
      'beto@tienda-b.test',
      'mario@tienda-b.test',
    ]);

    // Ninguno puede tocar a la gente del otro: responde como inexistente y nada cambia.
    expect(
      (await call(b, 'PATCH', `/api/team/${mine.id}`, { status: 'disabled' })).statusCode,
    ).toBe(404);
    expect(
      (await call(a, 'PATCH', `/api/team/${theirId}`, { displayName: 'Mía' })).statusCode,
    ).toBe(404);
    expect((await login('vendedor1@tienda-a.test')).status).toBe(200);
    expect(calls.filter((c) => c.startsWith('disable:'))).toEqual([]);
  });

  it('el tope se cuenta por tienda', async () => {
    for (let n = 1; n <= SELLER_LIMIT; n++) await addSeller(a, seller(n));
    const other = await call(b, 'POST', '/api/team/sellers', {
      displayName: 'Mario',
      email: 'mario@tienda-b.test',
      password: PASSWORD,
    });
    expect(other.statusCode).toBe(201);
  });
});
