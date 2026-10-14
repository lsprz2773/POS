import { z } from 'zod';
import { ROLES } from './permissions';

/** Tope de vendedores activos por tienda (T110). */
export const SELLER_LIMIT = 10;

/** Misma política que el grupo de usuarios de Cognito (infra/template.yaml). */
export const PASSWORD_MIN_LENGTH = 12;

const MESSAGE = {
  length: `Usa al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
  upper: 'Incluye una letra mayúscula.',
  lower: 'Incluye una letra minúscula.',
  digit: 'Incluye un número.',
};

/** La contraseña que registra el propietario (T108): nunca se guarda ni se devuelve. */
export const sellerPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, MESSAGE.length)
  .max(128, 'Usa como máximo 128 caracteres.')
  .refine((value) => /[A-Z]/.test(value), MESSAGE.upper)
  .refine((value) => /[a-z]/.test(value), MESSAGE.lower)
  .refine((value) => /\d/.test(value), MESSAGE.digit);

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Escribe el nombre.')
  .max(80, 'Usa como máximo 80 caracteres.');

export const createSellerSchema = z.object({
  displayName: displayNameSchema,
  email: z.string().trim().toLowerCase().pipe(z.email('Escribe un correo válido.').max(254)),
  password: sellerPasswordSchema,
});
export type CreateSellerInput = z.output<typeof createSellerSchema>;

export const memberStatusSchema = z.enum(['active', 'disabled']);
export type MemberStatus = z.infer<typeof memberStatusSchema>;

/** Cambios de un vendedor: su nombre o dar de baja y reactivar. Al menos uno. */
export const updateSellerSchema = z
  .object({ displayName: displayNameSchema, status: memberStatusSchema })
  .partial()
  .refine((value) => value.displayName !== undefined || value.status !== undefined, {
    message: 'Indica qué cambiar.',
  });
export type UpdateSellerInput = z.output<typeof updateSellerSchema>;

export const teamMemberSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string().nullable(),
  role: z.enum(ROLES),
  status: memberStatusSchema,
  createdAt: z.string(),
});
export type TeamMember = z.infer<typeof teamMemberSchema>;

export const teamListSchema = z.object({
  items: z.array(teamMemberSchema),
  /** Vendedores activos y tope por tienda. */
  activeSellers: z.number().int(),
  sellerLimit: z.number().int(),
});
export type TeamList = z.infer<typeof teamListSchema>;
