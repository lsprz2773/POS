import { z } from 'zod';
import { memberStatusSchema } from './team';
import { ROLES } from './permissions';
import { collectedByMethodSchema, topProductSchema } from './reports';
import { owedSchema } from './team-owed';

/** Cifras de una persona en un periodo: las mismas definiciones del reporte general, acotadas a sus ventas. */
export const sellerFiguresSchema = z.object({
  salesTotal: z.string(),
  salesCount: z.number().int(),
  averageTicket: z.string(),
  unitsSold: z.string(),
  /** Pagos vigentes recibidos en el periodo sobre sus ventas vigentes (mismo criterio que el reporte general). */
  collected: z.string(),
  collectedByMethod: collectedByMethodSchema,
  /** Lo que hoy falta por cobrar de sus ventas del periodo. */
  pending: z.string(),
  costOfGoodsSold: z.string(),
  grossProfit: z.string(),
  isGrossLoss: z.boolean(),
  grossMargin: z.string().nullable(),
  /** Porcentaje de las ventas de la tienda en el periodo; nulo si la tienda no vendió. */
  share: z.string().nullable(),
  cancelled: z.object({
    count: z.number().int(),
    total: z.string(),
    refundDue: z.string(),
    /** Canceladas sobre todas las ventas registradas (vigentes y canceladas), en porcentaje; nulo sin ventas. */
    rate: z.string().nullable(),
  }),
});
export type SellerFigures = z.infer<typeof sellerFiguresSchema>;

export const sellerReportRowSchema = z.object({
  userId: z.uuid(),
  name: z.string(),
  email: z.string(),
  role: z.enum(ROLES),
  status: memberStatusSchema,
  ...sellerFiguresSchema.shape,
  /** Lo que se le debe en total, de cualquier día; no depende del periodo. */
  owed: owedSchema,
});
export type SellerReportRow = z.infer<typeof sellerReportRowSchema>;

export const sellersReportSchema = z.object({
  from: z.string(),
  to: z.string(),
  /** Falso en una tienda sin vendedores: la interfaz no muestra los reportes del equipo. */
  hasSellers: z.boolean(),
  items: z.array(sellerReportRowSchema),
  /** Suma de todas las filas; coincide con el reporte general (RF-144). */
  totals: z.object({
    salesTotal: z.string(),
    salesCount: z.number().int(),
    costOfGoodsSold: z.string(),
    grossProfit: z.string(),
    collected: z.string(),
    pending: z.string(),
    owed: owedSchema,
  }),
});
export type SellersReport = z.infer<typeof sellersReportSchema>;

const bucketSchema = z.object({ total: z.string(), count: z.number().int() });

export const sellerDetailSchema = z.object({
  from: z.string(),
  to: z.string(),
  seller: sellerReportRowSchema,
  topProducts: z.array(topProductSchema),
  /** Un renglón por día del periodo, con ceros donde no hubo ventas. */
  daily: z.array(
    z.object({ date: z.string(), salesTotal: z.string(), salesCount: z.number().int() }),
  ),
  /** El periodo inmediato anterior (mismo tipo o misma duración) para comparar. */
  previous: z.object({
    from: z.string(),
    to: z.string(),
    salesTotal: z.string(),
    salesCount: z.number().int(),
    grossProfit: z.string(),
  }),
  /** Antigüedad de lo que se le debe, por días desde la fecha de la venta. */
  aging: z.object({
    upTo7: bucketSchema,
    from8To30: bucketSchema,
    over30: bucketSchema,
  }),
  /** Aprovechamiento del día: piezas preparadas contra vendidas en el periodo. */
  utilization: z.object({
    preparedUnits: z.string(),
    soldUnits: z.string(),
    soldPercent: z.string().nullable(),
    products: z.number().int(),
    soldOutProducts: z.number().int(),
  }),
});
export type SellerDetail = z.infer<typeof sellerDetailSchema>;
