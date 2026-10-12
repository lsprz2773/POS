import { createProductSchema, type Product } from '@pos/shared';
import { copy } from '../../copy/es';

/** Valores del formulario: siempre texto, como los teclea la persona. */
export interface ProductFormValues {
  name: string;
  price: string;
  cost: string;
  unit: string;
  code: string;
  category: string;
  description: string;
  notes: string;
  active: boolean;
}

export const EMPTY_FORM: ProductFormValues = {
  name: '',
  price: '',
  cost: '',
  unit: 'pieza',
  code: '',
  category: '',
  description: '',
  notes: '',
  active: true,
};

export const formFromProduct = (product: Product): ProductFormValues => ({
  name: product.name,
  price: product.price,
  cost: product.cost,
  unit: product.unit,
  code: product.code ?? '',
  category: product.category ?? '',
  description: product.description ?? '',
  notes: product.notes ?? '',
  active: product.active,
});

type Normalized = Record<string, string | null>;

export type Validation =
  | { ok: true; data: Normalized }
  | { ok: false; errors: Partial<Record<keyof ProductFormValues, string>> };

/**
 * Valida con el mismo esquema que el servidor (que de todos modos vuelve a validar). Devuelve los
 * valores normalizados: importes con 2 decimales y textos vacíos como `null`.
 */
export function validateProductForm(values: ProductFormValues): Validation {
  const result = createProductSchema.safeParse({
    name: values.name,
    price: values.price,
    cost: values.cost,
    unit: values.unit,
    code: values.code,
    category: values.category,
    description: values.description,
    notes: values.notes,
  });
  if (result.success) return { ok: true, data: result.data as Normalized };

  const errors: Partial<Record<keyof ProductFormValues, string>> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof ProductFormValues;
    // Un campo obligatorio vacío llega como "formato inválido": se explica mejor qué falta.
    const empty = values[key] === '' || values[key] === undefined;
    errors[key] ??=
      key === 'name' && empty
        ? copy.product.nameRequired
        : (key === 'price' || key === 'cost') && empty
          ? 'Escribe un importe, por ejemplo 25.00.'
          : issue.message;
  }
  return { ok: false, errors };
}

/** Solo los campos que cambiaron respecto al producto cargado: es lo único que se envía al editar. */
export function changedFields(initial: Normalized, next: Normalized): Normalized {
  const changes: Normalized = {};
  for (const key of Object.keys(next)) {
    if (next[key] !== initial[key]) changes[key] = next[key] ?? null;
  }
  return changes;
}
