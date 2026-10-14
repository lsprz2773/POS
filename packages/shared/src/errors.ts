import { z } from 'zod';

export const errorCodes = [
  'unauthenticated',
  'invalid_credentials',
  'store_not_configured',
  'tenant_disabled',
  'membership_disabled',
  'forbidden',
  'validation_error',
  'origin_not_allowed',
  'not_found',
  'conflict',
  'insufficient_stock',
  'internal_error',
] as const;

export const apiErrorSchema = z.object({
  code: z.enum(errorCodes),
  error: z.string(),
  fields: z.record(z.string(), z.string()).optional(),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
export type ErrorCode = (typeof errorCodes)[number];
