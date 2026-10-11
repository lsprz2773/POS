import { z } from 'zod';

/** Respuesta de `GET /api/health`: el proceso está vivo. */
export const healthResponseSchema = z.object({ status: z.literal('ok') });
export type HealthResponse = z.infer<typeof healthResponseSchema>;

/** Respuesta de `GET /api/health/ready`: el proceso puede atender solicitudes. */
export const readyResponseSchema = z.object({ status: z.enum(['ok', 'unavailable']) });
export type ReadyResponse = z.infer<typeof readyResponseSchema>;
