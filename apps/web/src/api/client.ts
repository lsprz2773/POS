import { apiErrorSchema, type ErrorCode } from '@pos/shared';
import type { ZodType } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: ErrorCode,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Listener = () => void;
const sessionExpiredListeners = new Set<Listener>();

/** La interfaz se suscribe para volver al inicio de sesión cuando la sesión ya no se puede renovar. */
export function onSessionExpired(listener: Listener): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  refreshInFlight ??= fetch('/api/auth/refresh', { method: 'POST' })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

async function send(method: string, path: string, body?: unknown): Promise<Response> {
  try {
    return await fetch(path, {
      method,
      headers: {
        accept: 'application/json',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network');
  }
}

/** Único punto de acceso a la API: concentra el manejo de errores y la renovación de sesión. */
export async function apiRequest<T>(
  method: string,
  path: string,
  schema: ZodType<T> | null,
  body?: unknown,
): Promise<T> {
  let response = await send(method, path, body);

  const isAuthEndpoint = path.startsWith('/api/auth/');
  if (response.status === 401 && !isAuthEndpoint) {
    if (await refreshSession()) {
      response = await send(method, path, body);
    } else {
      sessionExpiredListeners.forEach((listener) => listener());
    }
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);
    throw parsed.success
      ? new ApiError(response.status, parsed.data.error, parsed.data.code, parsed.data.fields)
      : new ApiError(response.status, 'La solicitud no se pudo completar.');
  }
  return schema ? schema.parse(payload) : (undefined as T);
}

export const apiGet = <T>(path: string, schema: ZodType<T>) => apiRequest('GET', path, schema);
export const apiPost = <T>(path: string, schema: ZodType<T> | null, body?: unknown) =>
  apiRequest('POST', path, schema, body);
export const apiPatch = <T>(path: string, schema: ZodType<T>, body: unknown) =>
  apiRequest('PATCH', path, schema, body);
