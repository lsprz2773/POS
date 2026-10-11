import type { FastifyInstance } from 'fastify';
import { createDb, type Database } from '../../src/db/client';
import { buildApp } from '../../src/app';
import { createLocalIdentityProvider } from '../../src/modules/auth/local-identity-provider';
import { provisionTenant } from '../../src/modules/tenancy/provision';

export const TEST_SECRET = 'secreto-solo-para-pruebas-0123456789abcdef';
export const APP_ORIGIN = 'http://localhost:5173';

export const TEST_USERS = [
  { email: 'ana@tienda-a.test', password: 'clave-ana-123' },
  { email: 'beto@tienda-b.test', password: 'clave-beto-123' },
  { email: 'sin-tienda@test.test', password: 'clave-sin-tienda' },
];

export function makeIdentity(overrides: { accessTtlSeconds?: number } = {}) {
  return createLocalIdentityProvider({
    secret: TEST_SECRET,
    usersJson: JSON.stringify(TEST_USERS),
    accessTtlSeconds: overrides.accessTtlSeconds ?? 900,
    refreshTtlSeconds: 3600,
  });
}

/** Base que no abre conexiones hasta que alguien la consulta (para pruebas sin PostgreSQL). */
export const lazyDb = (): Database => createDb('postgres://pos:pos@127.0.0.1:1/ninguna');

export function makeApp(
  db: Database,
  extra: { checkDatabase?: () => Promise<void> } = {},
): FastifyInstance {
  return buildApp({
    db,
    identity: makeIdentity(),
    config: { APP_ORIGIN, NODE_ENV: 'test' },
    ...extra,
  });
}

export interface Session {
  cookie: string;
  tenantId: string;
  userId: string;
  email: string;
}

/** Inicia sesión y devuelve la cabecera `cookie` lista para enviarse. */
export async function loginAs(app: FastifyInstance, email: string, password: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password },
  });
  if (response.statusCode !== 200) throw new Error(`login falló: ${response.statusCode}`);
  return response.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

/**
 * Crea dos tiendas independientes con su propietario y sesión iniciada.
 * Es la base de las pruebas de aislamiento entre tenants que debe tener cada fase.
 */
export async function createTwoTenants(app: FastifyInstance, db: Database) {
  const [a, b] = TEST_USERS;
  const tenantA = await provisionTenant(db, {
    storeName: 'Tienda A',
    email: a!.email,
    identitySubject: `local:${a!.email}`,
  });
  const tenantB = await provisionTenant(db, {
    storeName: 'Tienda B',
    email: b!.email,
    identitySubject: `local:${b!.email}`,
  });
  return {
    a: {
      ...tenantA,
      email: a!.email,
      cookie: await loginAs(app, a!.email, a!.password),
    } as Session,
    b: {
      ...tenantB,
      email: b!.email,
      cookie: await loginAs(app, b!.email, b!.password),
    } as Session,
  };
}

/** Limpia los datos de negocio entre pruebas (conserva el control de migraciones). */
export async function resetData(db: Database) {
  const { sql } = await import('kysely');
  await sql`truncate audit_events, memberships, store_settings, users, tenants restart identity cascade`.execute(
    db,
  );
}
