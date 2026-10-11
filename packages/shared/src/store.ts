import { z } from 'zod';

export const supportedCurrencies = ['MXN'] as const;

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usa el formato HH:MM.');

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('es-MX', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Campos editables de la tienda (RF-016, F-17). Los días van de 1 (lunes) a 7 (domingo). */
export const storeSettingsShape = {
  name: z.string().trim().min(1).max(100),
  currency: z.enum(supportedCurrencies),
  timezone: z.string().refine(isValidTimeZone, 'Zona horaria no válida.'),
  workdayStart: timeOfDay,
  workdayEnd: timeOfDay,
  operatingDays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
};

export const storeSettingsSchema = z
  .object(storeSettingsShape)
  .superRefine((value, ctx) => {
    if (value.workdayEnd <= value.workdayStart) {
      ctx.addIssue({
        code: 'custom',
        path: ['workdayEnd'],
        message: 'La hora de fin debe ser posterior a la de inicio.',
      });
    }
    if (new Set(value.operatingDays).size !== value.operatingDays.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['operatingDays'],
        message: 'No repitas días.',
      });
    }
  })
  .transform((value) => ({
    ...value,
    operatingDays: [...value.operatingDays].sort((a, b) => a - b),
  }));
export type StoreSettings = z.output<typeof storeSettingsSchema>;

/** PATCH: solo campos conocidos (cualquier otro, como un tenantId, se rechaza). */
export const storeSettingsUpdateSchema = z
  .object(storeSettingsShape)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Indica al menos un campo.');
export type StoreSettingsUpdate = z.infer<typeof storeSettingsUpdateSchema>;
