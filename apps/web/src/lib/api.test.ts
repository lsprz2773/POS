import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, onSessionExpired } from './api';
import { apiError, stubApi } from '../test/helpers';

afterEach(() => vi.unstubAllGlobals());

describe('cliente del API', () => {
  it('devuelve el cuerpo JSON y envía cookies del mismo origen', async () => {
    const { fetchMock } = stubApi({ 'GET /me': { body: { ok: true } } });
    await expect(api.get('/me')).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ credentials: 'same-origin' });
  });

  it('convierte los errores del servidor con su código, campos y referencia', async () => {
    stubApi({
      'POST /sales': {
        status: 400,
        body: { code: 'validation_error', error: 'Revisa los datos.', fields: { items: 'Falta' } },
        headers: { 'x-request-id': 'abc' },
      },
    });
    const error = await api.post('/sales', {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 'validation_error',
      fields: { items: 'Falta' },
      requestId: 'abc',
    });
  });

  it('distingue sin conexión, servidor caído y respuesta inesperada', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(api.get('/x')).rejects.toMatchObject({ code: 'network' });

    stubApi({ 'GET /x': { status: 503, body: 'no json' }, 'GET /y': { status: 500, body: 'x' } });
    await expect(api.get('/x')).rejects.toMatchObject({ code: 'unavailable' });
    await expect(api.get('/y')).rejects.toMatchObject({ code: 'unexpected' });
  });

  it('con 401 renueva la sesión una vez y repite la solicitud', async () => {
    let attempts = 0;
    const { calls } = stubApi({
      'GET /me': () =>
        ++attempts === 1 ? apiError(401, 'unauthenticated', 'Expiró') : { body: { id: 1 } },
      'POST /auth/refresh': { body: { status: 'ok' } },
    });
    await expect(api.get('/me')).resolves.toEqual({ id: 1 });
    expect(calls.map((c) => c.key)).toEqual(['GET /me', 'POST /auth/refresh', 'GET /me']);
  });

  it('varias solicitudes que fallan juntas comparten una sola renovación', async () => {
    const seen = new Set<string>();
    const { calls } = stubApi({
      'GET /a': () =>
        seen.has('a') ? { body: 1 } : (seen.add('a'), apiError(401, 'unauthenticated', 'x')),
      'GET /b': () =>
        seen.has('b') ? { body: 2 } : (seen.add('b'), apiError(401, 'unauthenticated', 'x')),
      'POST /auth/refresh': { body: {} },
    });
    await Promise.all([api.get('/a'), api.get('/b')]);
    expect(calls.filter((c) => c.key === 'POST /auth/refresh')).toHaveLength(1);
  });

  it('si no se puede renovar, avisa que la sesión expiró y lanza el error', async () => {
    const expired = vi.fn();
    const off = onSessionExpired(expired);
    stubApi({
      'GET /me': apiError(401, 'unauthenticated', 'Expiró'),
      'POST /auth/refresh': apiError(401, 'unauthenticated', 'Expiró'),
    });
    await expect(api.get('/me')).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(expired).toHaveBeenCalledTimes(1);
    off();
  });

  it('las rutas de acceso no intentan renovar la sesión', async () => {
    const { calls } = stubApi({
      'POST /auth/login': apiError(401, 'invalid_credentials', 'Correo o contraseña incorrectos.'),
    });
    await expect(api.post('/auth/login', {}, { skipRefresh: true })).rejects.toMatchObject({
      code: 'invalid_credentials',
    });
    expect(calls).toHaveLength(1);
  });

  it('una respuesta 204 no tiene cuerpo', async () => {
    stubApi({ 'POST /auth/logout': { status: 204 } });
    await expect(api.post('/auth/logout')).resolves.toBeUndefined();
  });
});
