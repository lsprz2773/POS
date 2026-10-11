import type { ZodType } from 'zod';
import { AppError } from './errors';

/** Valida una entrada con un esquema y la convierte en errores por campo. */
export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  throw new AppError(400, 'validation_error', 'Revisa los datos ingresados.', fields);
}
