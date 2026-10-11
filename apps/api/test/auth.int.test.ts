import { SignJWT } from 'jose';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { createDb, type Database } from '../src/db/client';
import { provisionTenant } from '../src/modules/tenancy/provision';
import {
  APP_ORIGIN,
  TEST_SECRET,
  TEST_USERS,
  createTwoTenants,
  loginAs,
  makeApp,
  resetData,
} from './support/app';

let db: Database;
let app: FastifyInstance;
const [ana, , sinTienda] = TEST_USERS;

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
});

const login = (email: string, password: string, headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password }, headers });

describe('inicio y cierre de sesión', () => {
  it('guarda la sesión en cookies HttpOnly y no devuelve tokens en el cuerpo', async () => {
    await createTwoTenants(app, db);
    const response = await login(ana!.email, ana!.password);
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toMatch(/eyJ/);
    const access = response.cookies.find((c) => c.name === 'pos_access')!;
    const refresh = response.cookies.find((c) => c.name === 'pos_refresh')!;
    expect(access.httpOnly).toBe(true);
    expect(access.sameSite).toBe('Strict');
    expect(refresh.httpOnly).toBe(true);
    expect(refresh.path).toBe('/api/auth');
  });

  it('responde igual ante contraseña incorrecta y usuario inexistente', async () => {
    await createTwoTenants(app, db);
    const wrongPassword = await login(ana!.email, 'incorrecta');
    const unknownUser = await login('nadie@test.test', 'incorrecta');
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownUser.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual(unknownUser.json());
    expect(wrongPassword.cookies).toHaveLength(0);
  });

  it('valida el formato del cuerpo', async () => {
    const response = await login('no-es-correo', '');
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('validation_error');
  });

  it('registra el inicio de sesión en la auditoría de la tienda', async () => {
    const { a } = await createTwoTenants(app, db);
    const events = await db
      .selectFrom('audit_events')
      .select(['action', 'entity', 'actor_user_id'])
      .where('tenant_id', '=', a.tenantId)
      .where('action', '=', 'login')
      .execute();
    expect(events).toEqual([{ action: 'login', entity: 'session', actor_user_id: a.userId }]);
  });

  it('el cierre de sesión borra las cookies', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/auth/logout' });
    expect(response.statusCode).toBe(204);
    const names = response.cookies.map((c) => c.name).sort();
    expect(names).toEqual(['pos_access', 'pos_refresh']);
    expect(response.cookies.every((c) => c.value === '')).toBe(true);
  });

  it('renueva la sesión con la cookie de renovación', async () => {
    await createTwoTenants(app, db);
    const first = await login(ana!.email, ana!.password);
    const refreshCookie = first.cookies.find((c) => c.name === 'pos_refresh')!;
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: { pos_refresh: refreshCookie.value },
    });
    expect(response.statusCode).toBe(200);
    expect(response.cookies.some((c) => c.name === 'pos_access' && c.value)).toBe(true);
  });

  it('rechaza renovar sin cookie, o con un token de acceso, y limpia la sesión', async () => {
    await createTwoTenants(app, db);
    const none = await app.inject({ method: 'POST', url: '/api/auth/refresh' });
    expect(none.statusCode).toBe(401);
    expect(none.cookies.every((c) => c.value === '')).toBe(true);

    const first = await login(ana!.email, ana!.password);
    const accessCookie = first.cookies.find((c) => c.name === 'pos_access')!;
    const wrongKind = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: { pos_refresh: accessCookie.value },
    });
    expect(wrongKind.statusCode).toBe(401);
  });
});

describe('solicitudes autenticadas', () => {
  it('GET /api/me devuelve usuario, tienda y rol', async () => {
    const { a } = await createTwoTenants(app, db);
    const response = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: a.cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: { id: a.userId, email: a.email },
      tenant: { id: a.tenantId, name: 'Tienda A' },
      role: 'owner',
    });
  });

  it('acepta la cabecera Bearer para herramientas', async () => {
    await createTwoTenants(app, db);
    const loginResponse = await login(ana!.email, ana!.password);
    const token = loginResponse.cookies.find((c) => c.name === 'pos_access')!.value;
    const response = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
  });

  it('rechaza con 401 sin token, con basura, manipulado o vencido', async () => {
    const { a } = await createTwoTenants(app, db);
    const valid = a.cookie
      .split('; ')
      .find((c) => c.startsWith('pos_access='))!
      .slice('pos_access='.length);
    const tampered = `${valid.slice(0, -4)}AAAA`;
    const expired = await new SignJWT({ email: ana!.email, use: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('pos-local')
      .setSubject(`local:${ana!.email}`)
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(TEST_SECRET));

    const attempts: Record<string, string>[] = [
      {},
      { cookie: 'pos_access=basura' },
      { cookie: `pos_access=${tampered}` },
      { cookie: `pos_access=${expired}` },
    ];
    for (const headers of attempts) {
      for (const url of ['/api/me', '/api/store']) {
        const response = await app.inject({ method: 'GET', url, headers });
        expect(response.statusCode, `${url} ${JSON.stringify(headers)}`).toBe(401);
        expect(response.json().code).toBe('unauthenticated');
      }
    }
  });

  it('un usuario autenticado sin tienda recibe el estado de configuración incompleta', async () => {
    await createTwoTenants(app, db);
    const cookie = await loginAs(app, sinTienda!.email, sinTienda!.password);
    const response = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('store_not_configured');
  });

  it('una tienda desactivada no puede operar', async () => {
    const { a } = await createTwoTenants(app, db);
    await sql`update tenants set status = 'disabled' where id = ${a.tenantId}`.execute(db);
    for (const url of ['/api/me', '/api/store']) {
      const response = await app.inject({ method: 'GET', url, headers: { cookie: a.cookie } });
      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('tenant_disabled');
    }
  });
});

describe('aislamiento de tenant', () => {
  it('ignora cualquier identificador de tenant enviado por el cliente', async () => {
    const { a, b } = await createTwoTenants(app, db);
    const attempts = [
      { url: `/api/store?tenantId=${b.tenantId}`, headers: { cookie: a.cookie } },
      { url: '/api/store', headers: { cookie: a.cookie, 'x-tenant-id': b.tenantId } },
      {
        url: `/api/me?tenant_id=${b.tenantId}`,
        headers: { cookie: a.cookie, 'x-tenant-id': b.tenantId },
      },
    ];
    for (const attempt of attempts) {
      const response = await app.inject({ method: 'GET', ...attempt });
      expect(response.statusCode).toBe(200);
      expect(JSON.stringify(response.json())).not.toContain(b.tenantId);
    }
    const store = await app.inject({
      method: 'GET',
      url: `/api/store?tenantId=${b.tenantId}`,
      headers: { cookie: a.cookie },
    });
    expect(store.json().name).toBe('Tienda A');
  });

  it('cada propietario solo ve su propia tienda', async () => {
    const { a, b } = await createTwoTenants(app, db);
    const forA = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: a.cookie } });
    const forB = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: b.cookie } });
    expect(forA.json().tenant.id).toBe(a.tenantId);
    expect(forB.json().tenant.id).toBe(b.tenantId);
  });
});

describe('origen de las solicitudes', () => {
  it('rechaza solicitudes que modifican datos desde otro origen', async () => {
    await createTwoTenants(app, db);
    const response = await login(ana!.email, ana!.password, {
      origin: 'https://sitio-malicioso.test',
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('origin_not_allowed');
    expect(response.cookies).toHaveLength(0);
  });

  it('acepta el origen de la aplicación', async () => {
    await createTwoTenants(app, db);
    const response = await login(ana!.email, ana!.password, { origin: APP_ORIGIN });
    expect(response.statusCode).toBe(200);
  });
});

describe('alta manual de tiendas', () => {
  it('rechaza correos o identidades repetidas', async () => {
    await provisionTenant(db, {
      storeName: 'Uno',
      email: 'x@test.test',
      identitySubject: 'local:x@test.test',
    });
    await expect(
      provisionTenant(db, {
        storeName: 'Dos',
        email: 'X@test.test',
        identitySubject: 'local:otro',
      }),
    ).rejects.toThrow(/Ya existe/);
    await expect(
      provisionTenant(db, {
        storeName: 'Tres',
        email: 'y@test.test',
        identitySubject: 'local:x@test.test',
      }),
    ).rejects.toThrow(/Ya existe/);
    const tenants = await db.selectFrom('tenants').select('id').execute();
    expect(tenants).toHaveLength(1);
  });
});
