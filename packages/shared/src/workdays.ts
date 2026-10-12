import { z } from 'zod';

/** Texto decimal de cantidad sin ceros sobrantes: "40", "2.5". Hasta 3 decimales (NUMERIC(12,3)). */
export function normalizeQuantity(value: string): string {
  const [whole = '0', fraction = ''] = value.trim().split('.');
  const digits = fraction.replace(/0+$/, '');
  const integer = whole.replace(/^0+(?=\d)/, '') || '0';
  return digits ? `${integer}.${digits}` : integer;
}

const quantityText = z
  .string('Escribe una cantidad, por ejemplo 40.')
  .trim()
  .superRefine((value, ctx) => {
    if (value.startsWith('-')) {
      ctx.addIssue({ code: 'custom', message: 'No puede ser negativa.' });
    } else if (!/^\d{1,9}(\.\d{1,3})?$/.test(value)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Escribe una cantidad válida con hasta 3 decimales, por ejemplo 40.',
      });
    }
  })
  .transform(normalizeQuantity);

/** Cantidad inicial: cero o más (RF-034). */
export const quantitySchema = quantityText;

/** Cantidad por la que se aumenta: mayor que cero. */
export const positiveQuantitySchema = quantityText.refine(
  (value) => value !== '0',
  'Escribe una cantidad mayor que cero.',
);

/** Fecha de negocio `AAAA-MM-DD` de la tienda, o `today` para el día de hoy en su zona horaria. */
export const workdayDateParamSchema = z.union(
  [z.literal('today'), z.iso.date('Usa una fecha válida con el formato AAAA-MM-DD.')],
  'Usa una fecha válida con el formato AAAA-MM-DD o "today".',
);

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usa el formato HH:MM.');

/** Agrega un producto activo a la jornada con su cantidad inicial (RF-028, RF-029). */
export const addOfferSchema = z
  .object({
    productId: z.uuid('Elige un producto válido.'),
    quantity: quantitySchema,
  })
  .strict();
export type AddOfferInput = z.output<typeof addOfferSchema>;

/** Aumenta la cantidad inicial con un motivo (B9, RF-038). */
export const addAdjustmentSchema = z
  .object({
    increment: positiveQuantitySchema,
    reason: z
      .string('Escribe el motivo del aumento.')
      .trim()
      .min(1, 'Escribe el motivo del aumento.')
      .max(200, 'Máximo 200 caracteres.'),
  })
  .strict();
export type AddAdjustmentInput = z.output<typeof addAdjustmentSchema>;

/** Ajusta el horario de una jornada concreta (B15). */
export const updateWorkdayHoursSchema = z
  .object({ startTime: timeOfDay.optional(), endTime: timeOfDay.optional() })
  .strict()
  .refine(
    (value) => value.startTime !== undefined || value.endTime !== undefined,
    'Indica al menos un campo.',
  );
export type UpdateWorkdayHoursInput = z.output<typeof updateWorkdayHoursSchema>;

export const listWorkdaysQuerySchema = z.object({
  from: z.iso.date('Usa el formato AAAA-MM-DD.').optional(),
  to: z.iso.date('Usa el formato AAAA-MM-DD.').optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListWorkdaysQuery = z.output<typeof listWorkdaysQuerySchema>;

export const stockAdjustmentSchema = z.object({
  id: z.uuid(),
  increment: z.string(),
  reason: z.string(),
  userEmail: z.string(),
  createdAt: z.string(),
});
export type StockAdjustment = z.infer<typeof stockAdjustmentSchema>;

export const dailyOfferSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  productName: z.string(),
  productCode: z.string().nullable(),
  productActive: z.boolean(),
  unit: z.string(),
  allowsFractions: z.boolean(),
  /** Precio de venta vigente en el catálogo (el de cada venta se congela al vender). */
  price: z.string(),
  initialQuantity: z.string(),
  adjustedQuantity: z.string(),
  soldQuantity: z.string(),
  availableQuantity: z.string(),
  adjustments: z.array(stockAdjustmentSchema),
});
export type DailyOffer = z.infer<typeof dailyOfferSchema>;

export const workdaySchema = z.object({
  id: z.uuid(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  isToday: z.boolean(),
  /** Una jornada pasada es de solo consulta. */
  editable: z.boolean(),
  isOperatingDay: z.boolean(),
  offers: z.array(dailyOfferSchema),
});
export type Workday = z.infer<typeof workdaySchema>;

export const workdaySummarySchema = z.object({
  id: z.uuid(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  products: z.number().int(),
  initialQuantity: z.string(),
  adjustedQuantity: z.string(),
  soldQuantity: z.string(),
  availableQuantity: z.string(),
});
export type WorkdaySummary = z.infer<typeof workdaySummarySchema>;

export const workdayListSchema = z.object({
  items: z.array(workdaySummarySchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});
export type WorkdayList = z.infer<typeof workdayListSchema>;
