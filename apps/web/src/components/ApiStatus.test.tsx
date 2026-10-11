import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ApiStatus } from './ApiStatus';
import { es } from '../i18n/es';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubFetch(response: Response | Error) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response))),
  );
}

describe('ApiStatus', () => {
  it('muestra conectado cuando la API responde ok', async () => {
    stubFetch(Response.json({ status: 'ok' }));
    render(<ApiStatus />);
    expect(await screen.findByText(es.status.ok)).toBeTruthy();
  });

  it('muestra sin conexión cuando la API responde 503', async () => {
    stubFetch(Response.json({ status: 'unavailable' }, { status: 503 }));
    render(<ApiStatus />);
    expect(await screen.findByText(es.status.unavailable)).toBeTruthy();
  });

  it('muestra sin conexión si falla la red', async () => {
    stubFetch(new TypeError('network'));
    render(<ApiStatus />);
    expect(await screen.findByText(es.status.unavailable)).toBeTruthy();
  });
});
