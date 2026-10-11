import { vi } from 'vitest';

type Handler = (init: RequestInit | undefined) => Response | Promise<Response>;

/** Sustituye `fetch` por rutas simuladas "MÉTODO /ruta". Devuelve el espía para inspeccionar llamadas. */
export function mockApi(routes: Record<string, Handler>) {
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${String(input)}`;
    const handler = routes[key];
    if (!handler) throw new Error(`Ruta simulada no definida: ${key}`);
    return handler(init);
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

export const json = (body: unknown, status = 200) => Response.json(body, { status });

export const me = {
  user: { id: 'u1', email: 'ana@tienda.test' },
  tenant: { id: 't1', name: 'Tienda A' },
  role: 'owner',
};

export const apiError = (status: number, code: string, error = 'Mensaje') =>
  json({ code, error }, status);
