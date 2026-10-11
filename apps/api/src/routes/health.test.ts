import { describe, expect, it } from 'vitest';
import { healthResponseSchema, readyResponseSchema } from '@pos/shared';
import { buildApp } from '../app';

describe('rutas de salud', () => {
  it('GET /api/health responde ok sin tocar la base', async () => {
    const app = buildApp({
      checkDatabase: async () => {
        throw new Error('no debería llamarse');
      },
    });
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(healthResponseSchema.parse(response.json())).toEqual({ status: 'ok' });
    await app.close();
  });

  it('GET /api/health/ready responde ok si la base responde', async () => {
    const app = buildApp({ checkDatabase: async () => {} });
    const response = await app.inject({ method: 'GET', url: '/api/health/ready' });
    expect(response.statusCode).toBe(200);
    expect(readyResponseSchema.parse(response.json()).status).toBe('ok');
    await app.close();
  });

  it('GET /api/health/ready responde 503 sin detalles si la base falla', async () => {
    const app = buildApp({
      checkDatabase: async () => {
        throw new Error('password authentication failed for user "pos"');
      },
    });
    const response = await app.inject({ method: 'GET', url: '/api/health/ready' });
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('password');
    await app.close();
  });

  it('devuelve un identificador de solicitud para diagnóstico', async () => {
    const app = buildApp({ checkDatabase: async () => {} });
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { 'x-request-id': 'abc-123' },
    });
    expect(response.headers['x-request-id']).toBe('abc-123');
    await app.close();
  });

  it('oculta los errores internos', async () => {
    const app = buildApp({ checkDatabase: async () => {} });
    app.get('/boom', async () => {
      throw new Error('detalle interno con secreto');
    });
    const response = await app.inject({ method: 'GET', url: '/boom' });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('secreto');
    await app.close();
  });
});
