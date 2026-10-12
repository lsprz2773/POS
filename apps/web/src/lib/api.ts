import { apiErrorSchema, type ErrorCode } from '@pos/shared';

/** Códigos del servidor más los que solo existen en el navegador. */
export type ClientErrorCode = ErrorCode | 'network' | 'unavailable' | 'unexpected';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ClientErrorCode,
    message: string,
    readonly fields: Record<string, string> = {},
    /** Valor de `x-request-id`, para que el propietario lo comparta con soporte. */
    readonly requestId: string | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const BASE = '/api';
const listeners = new Set<() => void>();

/** Avisa cuando la sesión ya no se puede renovar en medio del uso (M7, sesión expirada). */
export function onSessionExpired(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Rutas de autenticación no intentan renovar la sesión. */
  skipRefresh?: boolean;
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  try {
    return await fetch(`${BASE}${path}`, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'network', 'No hay conexión con el servidor.');
  }
}

async function toError(response: Response): Promise<ApiError> {
  const requestId = response.headers.get('x-request-id');
  const body = await response.json().catch(() => null);
  const parsed = apiErrorSchema.safeParse(body);
  if (parsed.success) {
    return new ApiError(
      response.status,
      parsed.data.code,
      parsed.data.error,
      parsed.data.fields,
      requestId,
    );
  }
  const unavailable = response.status === 502 || response.status === 503 || response.status === 504;
  return new ApiError(
    response.status,
    unavailable ? 'unavailable' : 'unexpected',
    'Respuesta inesperada del servidor.',
    {},
    requestId,
  );
}

// Una sola renovación a la vez: varias solicitudes que fallan juntas comparten el intento.
let refreshing: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  refreshing ??= send('/auth/refresh', { method: 'POST', skipRefresh: true })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response = await send(path, options);
  if (response.status === 401 && !options.skipRefresh) {
    if (await refreshSession()) {
      response = await send(path, options);
    }
    if (response.status === 401) {
      listeners.forEach((listener) => listener());
    }
  }
  if (!response.ok) throw await toError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown, options: RequestOptions = {}) =>
    request<T>(path, { ...options, method: 'POST', body: body ?? {} }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
};
