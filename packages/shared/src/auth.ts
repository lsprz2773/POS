import { z } from 'zod';
import { ROLES } from './permissions';

export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(1).max(256),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const meResponseSchema = z.object({
  user: z.object({ id: z.string(), email: z.string() }),
  tenant: z.object({ id: z.string(), name: z.string() }),
  role: z.enum(ROLES),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
