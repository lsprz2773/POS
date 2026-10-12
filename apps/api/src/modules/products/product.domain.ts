import { type Product, type UpdateProductInput } from '@pos/shared';

/** Campos del producto que una persona puede editar (todo menos id, versión y fechas). */
export type ProductChanges = Omit<UpdateProductInput, 'version'>;

export type ProductDiff = {
  before: Partial<ProductChanges>;
  after: Partial<ProductChanges>;
};

const EDITABLE_FIELDS = [
  'name',
  'price',
  'cost',
  'description',
  'category',
  'code',
  'unit',
  'notes',
  'active',
] as const;

/**
 * Compara los cambios pedidos con el producto actual y devuelve solo lo que realmente cambia,
 * con su valor anterior y nuevo. Un campo igual al actual no cuenta (no sube la versión).
 */
export function diffProduct(current: Product, changes: ProductChanges): ProductDiff {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    const next = changes[field];
    if (next !== undefined && next !== current[field]) {
      before[field] = current[field];
      after[field] = next;
    }
  }
  return { before: before as ProductDiff['before'], after: after as ProductDiff['after'] };
}

/** Acción de auditoría: activar y desactivar se distinguen cuando es el único cambio. */
export function auditActionFor(diff: ProductDiff): 'update' | 'activate' | 'deactivate' {
  const fields = Object.keys(diff.after);
  if (fields.length === 1 && fields[0] === 'active') {
    return diff.after.active ? 'activate' : 'deactivate';
  }
  return 'update';
}

/** Escapa % _ y \ para que la búsqueda trate el texto del usuario como texto literal. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}
