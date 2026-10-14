import { z } from 'zod';
import { memberStatusSchema } from './team';

/** Quién registró una venta (fase 10d): nombre para mostrar, o el correo si no lo tiene. */
export const sellerRefSchema = z.object({ id: z.uuid(), name: z.string() });
export type SellerRef = z.infer<typeof sellerRefSchema>;

/** Lo que se le debe a una persona: saldo de sus ventas vigentes de cualquier día (T112). */
export const owedSchema = z.object({ total: z.string(), count: z.number().int() });
export type Owed = z.infer<typeof owedSchema>;

/** Desglose de lo pendiente por vendedor, para el propietario cuando la tienda tiene vendedores. */
export const owedBySellerSchema = z.object({
  userId: z.uuid(),
  name: z.string(),
  status: memberStatusSchema,
  total: z.string(),
  count: z.number().int(),
});
export type OwedBySeller = z.infer<typeof owedBySellerSchema>;

/** Lo de hoy de cada persona, para el bloque "Por vendedor" de la pantalla Hoy. */
export const todayBySellerSchema = z.object({
  userId: z.uuid(),
  name: z.string(),
  status: memberStatusSchema,
  salesTotal: z.string(),
  salesCount: z.number().int(),
  collected: z.string(),
  owed: owedSchema,
});
export type TodayBySeller = z.infer<typeof todayBySellerSchema>;
