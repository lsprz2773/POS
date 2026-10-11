import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, apiGet, onSessionExpired } from './client';
import { apiError, json, mockApi } from '../test/mockApi';

afterEach(() => vi.unstubAllGlobals());

const schema = z.object({ ok: z.boolean() });

describe('cliente de API', () => {
  it('renueva la sesión una vez y repite la solicitud cuando recibe 401', async () => {
    let calls = 0;
    const spy = mockApi({
      'GET /api/datos': () =>
        ++calls === 1 ? apiError(401, 'unauthenticated') : json({ ok: true }),
      'POST /api/auth/refresh': () => json({ status: 'ok' }),
    });
    await expect(apiGet('/api/datos', schema)).resolves.toEqual({ ok: true });
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('avisa que la sesión expiró si no se puede renovar', async () => {
    mockApi({
      'GET /api/datos': () => apiError(401, 'unauthenticated'),
      'POST /api/auth/refresh': () => apiError(401, 'unauthenticated'),
    });
    const listener = vi.fn();
    const off = onSessionExpired(listener);
    await expect(apiGet('/api/datos', schema)).rejects.toMatchObject({ status: 401 });
    expect(listener).toHaveBeenCalledOnce();
    off();
  });

  it('no intenta renovar cuando falla un endpoint de autenticación', async () => {
    const spy = mockApi({
      'POST /api/auth/login': () => apiError(401, 'invalid_credentials', 'Mal'),
    });
    const { apiPost } = await import('./client');
    await expect(apiPost('/api/auth/login', null, {})).rejects.toMatchObject({
      code: 'invalid_credentials',
      message: 'Mal',
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('convierte una falla de red en ApiError con estado 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')));
    await expect(apiGet('/api/datos', schema)).rejects.toBeInstanceOf(ApiError);
    await expect(apiGet('/api/datos', schema)).rejects.toMatchObject({ status: 0 });
  });

  it('conserva los errores por campo del servidor', async () => {
    mockApi({
      'GET /api/datos': () =>
        json({ code: 'validation_error', error: 'Revisa', fields: { name: 'Obligatorio' } }, 400),
    });
    await expect(apiGet('/api/datos', schema)).rejects.toMatchObject({
      fields: { name: 'Obligatorio' },
    });
  });
});
