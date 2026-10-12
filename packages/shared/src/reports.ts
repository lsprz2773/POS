import { z } from 'zod';

export const reportPeriods = ['day', 'week', 'month'] as const;

/**
 * Periodo del reporte: día, semana (lunes a domingo) o mes que contiene `date` (hoy por omisión), o
 * un rango con `from` y `to` (RF-081 a RF-084).
 */
export const reportQuerySchema = z
  .object({
    period: z.enum(reportPeriods, 'Elige día, semana o mes.').optional(),
    date: z.iso.date('Usa el formato AAAA-MM-DD.').optional(),
    from: z.iso.date('Usa el formato AAAA-MM-DD.').optional(),
    to: z.iso.date('Usa el formato AAAA-MM-DD.').optional(),
  })
  .superRefine((value, ctx) => {
    const isRange = value.from !== undefined || value.to !== undefined;
    if (isRange && (value.from === undefined || value.to === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: [value.from === undefined ? 'from' : 'to'],
        message: 'Indica la fecha inicial y la final del rango.',
      });
    }
    if (isRange && (value.period !== undefined || value.date !== undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['period'],
        message: 'Usa un periodo o un rango de fechas, no ambos.',
      });
    }
  });
export type ReportQuery = z.output<typeof reportQuerySchema>;

export const topProductSchema = z.object({
  productId: z.uuid(),
  name: z.string(),
  units: z.string(),
  amount: z.string(),
});

export const collectedByMethodSchema = z.object({ cash: z.string(), transfer: z.string() });

export const reportSchema = z.object({
  from: z.string(),
  to: z.string(),
  /** Suma del total de las ventas vigentes con fecha de negocio dentro del periodo. */
  salesTotal: z.string(),
  salesCount: z.number().int(),
  averageTicket: z.string(),
  unitsSold: z.string(),
  /** Pagos vigentes recibidos dentro del periodo, de ventas vigentes. */
  collected: z.string(),
  collectedByMethod: collectedByMethodSchema,
  /** Lo que hoy falta por cobrar de las ventas del periodo. */
  pending: z.string(),
  costOfGoodsSold: z.string(),
  /** Ventas − costo de productos vendidos. No es utilidad neta. Puede ser negativa. */
  grossProfit: z.string(),
  isGrossLoss: z.boolean(),
  /** Porcentaje con 2 decimales; nulo si no hubo ventas. */
  grossMargin: z.string().nullable(),
  topProducts: z.array(topProductSchema),
  cancelled: z.object({
    count: z.number().int(),
    total: z.string(),
    /** Pagos vigentes de ventas canceladas: se devuelven fuera del sistema (B14). */
    refundDue: z.string(),
  }),
});
export type Report = z.infer<typeof reportSchema>;

export const dashboardSchema = z.object({
  date: z.string(),
  salesTotal: z.string(),
  salesCount: z.number().int(),
  collected: z.string(),
  collectedByMethod: collectedByMethodSchema,
  /** Ventas vigentes con saldo, de cualquier día (RF-079). */
  pendingCount: z.number().int(),
  pendingTotal: z.string(),
  /** Utilidad bruta estimada del día; no es utilidad neta. */
  estimatedGrossProfit: z.string(),
  isGrossLoss: z.boolean(),
  dayPrepared: z.boolean(),
});
export type Dashboard = z.infer<typeof dashboardSchema>;
