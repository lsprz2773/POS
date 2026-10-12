import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { createQueryClient, routes } from '../App';
import { ToastProvider } from '../components/Toast';

export interface FakeResponse {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

type Handler = (request: { method: string; body: unknown }) => FakeResponse | Promise<FakeResponse>;

/** Sustituye `fetch` por rutas simuladas; una ruta sin simular hace fallar la prueba. */
export function stubApi(routes: Record<string, Handler | FakeResponse>) {
  const calls: { key: string; url: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const url = String(input).replace(/^\/api/, '');
    // Una ruta sin consulta (`GET /products`) atiende cualquier consulta (`?q=…&status=…`).
    const key = `${method} ${url.split('?')[0]}`;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ key, url, body });
    const route = routes[`${method} ${url}`] ?? routes[key];
    if (!route) throw new Error(`Ruta sin simular: ${method} ${url}`);
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
    <QueryClientProvider client={createQueryClient(false)}>
      <ToastProvider>
        <RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

let counter = 0;

/** Producto de prueba con los campos que devuelve el API. */
export function makeProduct(overrides: Record<string, unknown> = {}) {
  counter += 1;
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    name: 'Tamal de rajas',
    description: null,
    category: null,
    code: 'TAM-01',
    unit: 'pieza',
    allowsFractions: false,
    price: '25.00',
    cost: '14.00',
    notes: null,
    active: true,
    version: 1,
    createdAt: '2026-10-12T15:00:00.000Z',
    updatedAt: '2026-10-12T15:00:00.000Z',
    ...overrides,
  };
}

export const productList = (items: unknown[], total = items.length, offset = 0) => ({
  body: { items, total, limit: 50, offset },
});

export const STORE = {
  name: 'Tamales Ana',
  currency: 'MXN',
  timezone: 'America/Mexico_City',
  workdayStart: '08:00',
  workdayEnd: '16:00',
  operatingDays: [1, 2, 3, 4, 5],
};
