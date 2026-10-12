import { z } from 'zod';
import { collectionStatuses, paymentLinesSchema, paymentSchema } from './payments';
import { positiveQuantitySchema } from './workdays';
import { optionalText } from './text';

/** Llave que identifica un intento de venta; reenviarla no duplica la venta (RF-062, T7). */
export const idempotencyKeySchema = z
  .string('Falta la llave de idempotencia (encabezado Idempotency-Key).')
  .regex(
    /^[A-Za-z0-9._:-]{8,128}$/,
    'La llave de idempotencia debe tener de 8 a 128 caracteres (letras, números, . _ : -).',
  );

const saleItemInputSchema = z
  .object({
    productId: z.uuid('Elige un producto válido.'),
    quantity: positiveQuantitySchema,
  })
  .strict();

/**
 * Alta de venta. El cliente solo dice qué y cuánto: nombre, precio, costo, subtotales, total,
 * fecha y tienda los decide el backend (RNF-025). Cualquier otro campo se rechaza.
 */
export const createSaleSchema = z
  .object({
    items: z
      .array(saleItemInputSchema, 'Agrega al menos un producto.')
      .min(1, 'Agrega al menos un producto.')
      .max(50, 'Máximo 50 renglones por venta.'),
    customerReference: optionalText(100).optional(),
    note: optionalText(500).optional(),
    /** Pago opcional al crear la venta, en la misma operación (RF-058). */
    payments: paymentLinesSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.items.forEach((item, index) => {
      if (seen.has(item.productId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'productId'],
          message: 'Este producto está repetido. Junta las cantidades en un solo renglón.',
        });
      }
      seen.add(item.productId);
    });
  });
export type CreateSaleInput = z.output<typeof createSaleSchema>;

export const saleStatuses = ['active', 'cancelled'] as const;

export const saleItemSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  productName: z.string(),
  quantity: z.string(),
  unitPrice: z.string(),
  subtotal: z.string(),
});
export type SaleItem = z.infer<typeof saleItemSchema>;

export const saleSchema = z.object({
  id: z.uuid(),
  /** Folio legible, por ejemplo "V-0043" (RF-049). */
  folio: z.string(),
  folioNumber: z.number().int(),
  /** Fecha de negocio de la jornada a la que pertenece. */
  date: z.string(),
  createdAt: z.string(),
  status: z.enum(saleStatuses),
  customerReference: z.string().nullable(),
  note: z.string().nullable(),
  total: z.string(),
  /** Aviso (B15): la venta se hizo fuera del horario de su jornada; no la bloquea. */
  outsideWorkdayHours: z.boolean(),
  /** Suma de los pagos vigentes (RF-056). */
  paid: z.string(),
  /** Falta por pagar = total − pagado (RF-057). */
  balance: z.string(),
  paymentStatus: z.enum(collectionStatuses),
  /** Cuándo quedó pagada por completo; nulo si tiene saldo (RF-068). */
  settledAt: z.string().nullable(),
  payments: z.array(paymentSchema),
  items: z.array(saleItemSchema),
});
export type Sale = z.infer<typeof saleSchema>;
