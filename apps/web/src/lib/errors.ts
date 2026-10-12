import { copy } from '../copy/es';
import { ApiError } from './api';

/** Mensaje para el usuario. Los textos del servidor ya vienen en español y sin detalles internos. */
export function messageOf(error: unknown): string {
  if (!(error instanceof ApiError)) return copy.errors.unexpected;
  switch (error.code) {
    case 'network':
      return copy.errors.network;
    case 'unavailable':
      return copy.errors.unavailable;
    case 'unexpected':
    case 'internal_error':
      return copy.errors.unexpected;
    default:
      return error.message;
  }
}

export const requestIdOf = (error: unknown): string | null =>
  error instanceof ApiError ? error.requestId : null;
