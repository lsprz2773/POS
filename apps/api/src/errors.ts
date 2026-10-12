import { type ErrorCode } from '@pos/shared';

/** Error esperado que se traduce a una respuesta HTTP sin detalles internos. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const unauthenticated = () =>
  new AppError(401, 'unauthenticated', 'Tu sesión no es válida. Inicia sesión de nuevo.');
