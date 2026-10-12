import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { AppRoutes, createQueryClient } from '../App';
import { ToastProvider } from '../components/Toast';

export interface FakeResponse {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

type Handler = (request: { method: string; body: unknown }) => FakeResponse | Promise<FakeResponse>;

/** Sustituye `fetch` por rutas simuladas; una ruta sin simular hace fallar la prueba. */
export function stubApi(routes: Record<string, Handler | FakeResponse>) {
  const calls: { key: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const key = `${method} ${String(input).replace(/^\/api/, '')}`;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ key, body });
    const route = routes[key];
    if (!route) throw new Error(`Ruta sin simular: ${key}`);
    const result = typeof route === 'function' ? await route({ method, body }) : route;
    const status = result.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(result.body ?? {}), {
      status,
      headers: { 'content-type': 'application/json', ...result.headers },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

export const ME = {
  user: { id: 'u1', email: 'ana@tienda.test' },
  tenant: { id: 't1', name: 'Tamales Ana' },
  role: 'owner',
};

export const apiError = (status: number, code: string, error: string, requestId = 'req-123') => ({
  status,
  body: { code, error },
  headers: { 'x-request-id': requestId },
});

export function renderApp(path = '/') {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}
