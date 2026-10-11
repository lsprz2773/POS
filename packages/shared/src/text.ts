import { z } from 'zod';

/** Texto sin espacios sobrantes y con un máximo de caracteres. */
export const text = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres.`);

/** Texto opcional: la cadena vacía equivale a "sin valor". */
export const optionalText = (max: number) =>
  text(max)
    .transform((value) => (value === '' ? null : value))
    .nullable();
