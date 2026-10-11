import type { ZodType } from 'zod';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Único punto de acceso a la API: concentra el manejo de errores y de sesión. */
export async function apiGet<T>(path: string, schema: ZodType<T>): Promise<T> {
  const response = await fetch(path, { headers: { accept: 'application/json' } });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, 'La solicitud no se pudo completar.');
  }
  return schema.parse(body);
}
