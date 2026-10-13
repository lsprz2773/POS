import { z } from 'zod';
import { optionalText, text } from './text';

/** Texto decimal con exactamente 2 decimales ("25.00"). Nunca `number` (RF-021, RNF-016). */
export function normalizeMoney(value: string): string {
  const [whole = '0', fraction = ''] = value.trim().split('.');
  return `${whole.replace(/^0+(?=\d)/, '') || '0'}.${fraction.padEnd(2, '0').slice(0, 2)}`;
}

/** Importe de 0 a 9,999,999,999.99 enviado como texto para no perder precisión. */
export const moneySchema = z
  .string('Escribe un importe, por ejemplo 25.00.')
  .trim()
  .superRefine((value, ctx) => {
    if (value.startsWith('-')) {
      ctx.addIssue({ code: 'custom', message: 'No puede ser negativo.' });
    } else if (!/^\d{1,10}(\.\d{1,2})?$/.test(value)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Escribe un importe válido con hasta 2 decimales, por ejemplo 25.50.',
      });
    }
  })
  .transform(normalizeMoney);

const name = text(100).min(1, 'Escribe el nombre del producto.');
const unit = text(20).min(1, 'Escribe la unidad, por ejemplo pieza.');

/** Alta de producto (RF-017 a RF-022). Cualquier campo desconocido, como un tenantId, se rechaza. */
export const createProductSchema = z
  .object({
    name,
    price: moneySchema,
    cost: moneySchema,
    description: optionalText(500).optional(),
    category: optionalText(60).optional(),
    code: optionalText(40).optional(),
    unit: unit.optional(),
    notes: optionalText(500).optional(),
  })
  .strict();
export type CreateProductInput = z.output<typeof createProductSchema>;

/**
 * Edición parcial (RF-023, RF-024). `version` es obligatoria: es la versión que la persona vio
 * al abrir el producto, y evita sobrescribir cambios de otra sesión sin avisar.
 */
export const updateProductSchema = z
  .object({
    version: z.number('Falta la versión del producto.').int().min(1),
    name: name.optional(),
    price: moneySchema.optional(),
    cost: moneySchema.optional(),
    description: optionalText(500).optional(),
    category: optionalText(60).optional(),
    code: optionalText(40).optional(),
    unit: unit.optional(),
    notes: optionalText(500).optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).some((key) => key !== 'version'),
    'Indica al menos un campo por cambiar.',
  );
export type UpdateProductInput = z.output<typeof updateProductSchema>;

export const productStatusFilters = ['active', 'inactive', 'all'] as const;

/** Consulta del catálogo: búsqueda simple por nombre o código (RF-027). */
export const listProductsQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(productStatusFilters).default('active'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListProductsQuery = z.output<typeof listProductsQuerySchema>;

export const productSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  category: z.string().nullable(),
  code: z.string().nullable(),
  unit: z.string(),
  allowsFractions: z.boolean(),
  price: z.string(),
  cost: z.string(),
  notes: z.string().nullable(),
  active: z.boolean(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Product = z.infer<typeof productSchema>;

export const productListSchema = z.object({
  items: z.array(productSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});
export type ProductList = z.infer<typeof productListSchema>;
