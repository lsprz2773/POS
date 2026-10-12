import { z } from 'zod';
import { collectionStatuses } from './payments';
import { saleStatuses } from './sales';

/** Filtros del historial de ventas (RF-081 y siguientes, RNF-006). */
export const listSalesQuerySchema = z
  .object({
    from: z.iso.date('Usa el formato AAAA-MM-DD.').optional(),
    to: z.iso.date('Usa el formato AAAA-MM-DD.').optional(),
    status: z.enum(saleStatuses, 'Elige vigente o cancelada.').optional(),
    /** Estado de cobro de las ventas vigentes; `unpaid` agrupa pendientes y parciales (con saldo). */
    collection: z
      .enum(
        ['pending', 'partial', 'paid', 'unpaid'],
        'Elige pendiente, parcial, pagada o con saldo.',
      )
      .optional(),
    /** Folio (por ejemplo "V-0043" o "43") o parte de la referencia del cliente. */
    q: z
      .string()
      .trim()
      .max(100, 'Máximo 100 caracteres.')
      .optional()
      .transform((value) => value || undefined),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .superRefine((value, ctx) => {
    if (value.collection && value.status === 'cancelled') {
      ctx.addIssue({
        code: 'custom',
        path: ['collection'],
        message: 'El estado de cobro solo aplica a ventas vigentes.',
      });
    }
  });
export type ListSalesQuery = z.output<typeof listSalesQuerySchema>;

export const saleSummarySchema = z.object({
  id: z.uuid(),
  folio: z.string(),
  folioNumber: z.number().int(),
  date: z.string(),
  createdAt: z.string(),
  customerReference: z.string().nullable(),
  status: z.enum(saleStatuses),
  total: z.string(),
  paid: z.string(),
  /** Una venta cancelada ya no se cobra: su falta por pagar es 0. */
  balance: z.string(),
  paymentStatus: z.enum(collectionStatuses),
});
export type SaleSummary = z.infer<typeof saleSummarySchema>;

export const salesListSchema = z.object({
  items: z.array(saleSummarySchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});
export type SalesList = z.infer<typeof salesListSchema>;
