import { z } from 'zod';
import { moneySchema } from './products';

/** Solo se informa por qué medio pagaron; no hay pasarelas ni validación bancaria (B16, regla 44). */
export const paymentMethods = ['cash', 'transfer'] as const;
export const paymentStatuses = ['valid', 'voided'] as const;
/** Estado de cobro de una venta; `partial` la interfaz lo agrupa con `pending` (RF-065). */
export const collectionStatuses = ['pending', 'partial', 'paid', 'cancelled'] as const;

const positiveMoneySchema = moneySchema.refine(
  (value) => value !== '0.00',
  'El importe debe ser mayor que cero.',
);

const paymentLineSchema = z
  .object({
    method: z.enum(paymentMethods, 'Elige efectivo o transferencia.'),
    amount: positiveMoneySchema,
  })
  .strict();

/** Uno o dos renglones, uno por método. Un pago mixto trae efectivo y transferencia (RF-053). */
export const paymentLinesSchema = z
  .array(paymentLineSchema, 'Indica al menos un pago.')
  .min(1, 'Indica al menos un pago.')
  .max(2, 'Máximo un renglón por método: efectivo y transferencia.')
  .superRefine((lines, ctx) => {
    const seen = new Set<string>();
    lines.forEach((line, index) => {
      if (seen.has(line.method)) {
        ctx.addIssue({
          code: 'custom',
          path: [index, 'method'],
          message: 'Junta los importes del mismo método en un solo renglón.',
        });
      }
      seen.add(line.method);
    });
  });
export type PaymentLinesInput = z.output<typeof paymentLinesSchema>;

/** Registra un pago sobre una venta ya creada (RF-059). */
export const registerPaymentSchema = z.object({ lines: paymentLinesSchema }).strict();
export type RegisterPaymentInput = z.output<typeof registerPaymentSchema>;

/** Anula un pago con motivo; el pago se conserva (B4). */
export const voidPaymentSchema = z
  .object({
    reason: z
      .string('Escribe el motivo de la anulación.')
      .trim()
      .min(1, 'Escribe el motivo de la anulación.')
      .max(200, 'Máximo 200 caracteres.'),
  })
  .strict();
export type VoidPaymentInput = z.output<typeof voidPaymentSchema>;

/** Ventas con saldo pendiente (RF-073), con filtro por fecha de venta (RF-074). */
export const listPendingQuerySchema = z.object({
  from: z.iso.date('Usa el formato AAAA-MM-DD.').optional(),
  to: z.iso.date('Usa el formato AAAA-MM-DD.').optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListPendingQuery = z.output<typeof listPendingQuerySchema>;

export const paymentSchema = z.object({
  id: z.uuid(),
  /** Los renglones de un pago mixto comparten operación. */
  operationId: z.uuid(),
  method: z.enum(paymentMethods),
  amount: z.string(),
  status: z.enum(paymentStatuses),
  createdAt: z.string(),
  voidedAt: z.string().nullable(),
  voidReason: z.string().nullable(),
});
export type Payment = z.infer<typeof paymentSchema>;

export const pendingSaleSchema = z.object({
  id: z.uuid(),
  folio: z.string(),
  folioNumber: z.number().int(),
  date: z.string(),
  createdAt: z.string(),
  customerReference: z.string().nullable(),
  total: z.string(),
  paid: z.string(),
  balance: z.string(),
  paymentStatus: z.enum(collectionStatuses),
});
export type PendingSale = z.infer<typeof pendingSaleSchema>;

export const pendingListSchema = z.object({
  items: z.array(pendingSaleSchema),
  /** Ventas pendientes que cumplen el filtro. */
  total: z.number().int(),
  /** Suma de lo que falta por cobrar de todas ellas, no solo de la página. */
  totalBalance: z.string(),
  limit: z.number().int(),
  offset: z.number().int(),
});
export type PendingList = z.infer<typeof pendingListSchema>;
