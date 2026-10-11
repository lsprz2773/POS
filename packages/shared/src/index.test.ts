import { describe, expect, it } from 'vitest';
import { healthResponseSchema, readyResponseSchema } from './index';

describe('esquemas de salud', () => {
  it('acepta la respuesta de vida', () => {
    expect(healthResponseSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
  });

  it('rechaza estados desconocidos', () => {
    expect(() => healthResponseSchema.parse({ status: 'raro' })).toThrow();
    expect(() => readyResponseSchema.parse({ status: 'raro' })).toThrow();
  });

  it('acepta los estados de disponibilidad', () => {
    expect(readyResponseSchema.parse({ status: 'unavailable' }).status).toBe('unavailable');
  });
});
