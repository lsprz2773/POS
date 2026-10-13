import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from './db/client';
import { createHandler, handler as lambdaHandler } from './lambda';

// Evento de API Gateway tipo HTTP API (carga útil 2.0), como lo manda CloudFront.
function event(method: string, path: string, extra: Record<string, unknown> = {}) {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: path,
    rawQueryString: '',
    headers: { host: 'abc.execute-api.us-east-1.amazonaws.com', ...(extra.headers as object) },
    cookies: extra.cookies,
    requestContext: { http: { method, path, sourceIp: '1.2.3.4', userAgent: 'prueba' } },
    isBase64Encoded: false,
    body: extra.body,
  } as never;
}

const context = { awsRequestId: 'req-lambda-1' } as never;
const fakeDb = {} as Database;

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('DATABASE_URL', 'postgres://u@h/db');
  vi.stubEnv('AUTH_SECRET', 'x'.repeat(32));
  vi.stubEnv('APP_ORIGIN', 'https://web.example.test');
});
afterEach(() => vi.unstubAllEnvs());

describe('handler de Lambda', () => {
  it('responde la salud de la API con el identificador de solicitud', async () => {
    const handler = await createHandler({ db: fakeDb, logger: false });
    const response = (await handler(event('GET', '/api/health'), context)) as {
      statusCode: number;
      body: string;
      headers: Record<string, string>;
    };
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: 'ok' });
    expect(response.headers['x-request-id']).toBeTruthy();
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('una ruta desconocida da 404 en JSON, no una página', async () => {
    const handler = await createHandler({ db: fakeDb, logger: false });
    const response = (await handler(event('GET', '/api/no-existe'), context)) as {
      statusCode: number;
      body: string;
    };
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toMatchObject({ code: 'not_found' });
  });

  it('una ruta protegida sin sesión da 401', async () => {
    const handler = await createHandler({ db: fakeDb, logger: false });
    const response = (await handler(event('GET', '/api/me'), context)) as { statusCode: number };
    expect(response.statusCode).toBe(401);
  });

  it('rechaza una escritura de otro origen, igual que en local', async () => {
    const handler = await createHandler({ db: fakeDb, logger: false });
    const response = (await handler(
      event('POST', '/api/auth/logout', { headers: { origin: 'https://otro.example.test' } }),
      context,
    )) as { statusCode: number };
    expect(response.statusCode).toBe(403);
  });

  it('la verificación de base de datos informa 503 si no responde', async () => {
    const handler = await createHandler({
      db: fakeDb,
      logger: false,
      checkDatabase: async () => {
        throw new Error('sin base');
      },
    });
    const response = (await handler(event('GET', '/api/health/ready'), context)) as {
      statusCode: number;
    };
    expect(response.statusCode).toBe(503);
  });

  it('las cookies de sesión salen en el campo cookies de la respuesta 2.0', async () => {
    const handler = await createHandler({ db: fakeDb, logger: false });
    const response = (await handler(
      event('POST', '/api/auth/logout', { cookies: ['pos_refresh=algo'] }),
      context,
    )) as { statusCode: number; cookies?: string[] };
    expect(response.statusCode).toBe(204);
    expect(response.cookies?.some((c) => c.startsWith('pos_refresh=;'))).toBe(true);
  });

  it('el handler usa el identificador de API Gateway como identificador de solicitud', async () => {
    vi.stubEnv('LOG_LEVEL', 'silent');
    const request = event('GET', '/api/health');
    (request as { requestContext: Record<string, unknown> }).requestContext.requestId = 'agw-123';
    // La base nunca se consulta en /health; el pool no abre conexiones hasta usarse.
    const response = (await lambdaHandler(request, context)) as { headers: Record<string, string> };
    expect(response.headers['x-request-id']).toBe('agw-123');
  });
});
