import { describe, expect, it } from 'vitest';
import { listPendingQuerySchema, registerPaymentSchema, voidPaymentSchema } from './index';

describe('registerPaymentSchema', () => {
  it('acepta efectivo, transferencia o ambos y normaliza los importes', () => {
    expect(registerPaymentSchema.parse({ lines: [{ method: 'cash', amount: '50' }] })).toEqual({
      lines: [{ method: 'cash', amount: '50.00' }],
    });
    expect(
      registerPaymentSchema.safeParse({
        lines: [
          { method: 'cash', amount: '30.5' },
          { method: 'transfer', amount: '19.50' },
        ],
      }).success,
    ).toBe(true);
  });

  it('rechaza importes en cero, negativos o inválidos', () => {
    for (const amount of ['0', '0.00', '-1', 'abc', '1.234', '']) {
      expect(
        registerPaymentSchema.safeParse({ lines: [{ method: 'cash', amount }] }).success,
        amount,
      ).toBe(false);
    }
    expect(
      registerPaymentSchema.safeParse({ lines: [{ method: 'cash', amount: 5 }] }).success,
    ).toBe(false);
  });

  it('rechaza métodos que no existen (no hay pasarelas) y renglones repetidos', () => {
    for (const method of ['card', 'tarjeta', 'mercadopago', '']) {
      expect(
        registerPaymentSchema.safeParse({ lines: [{ method, amount: '5' }] }).success,
        method,
      ).toBe(false);
    }
    const repeated = registerPaymentSchema.safeParse({
      lines: [
        { method: 'cash', amount: '5' },
        { method: 'cash', amount: '5' },
      ],
    });
    expect(repeated.success).toBe(false);
    expect(repeated.error?.issues[0]?.path).toEqual(['lines', 1, 'method']);
  });

  it('pide de 1 a 2 renglones y rechaza campos desconocidos', () => {
    expect(registerPaymentSchema.safeParse({ lines: [] }).success).toBe(false);
    expect(registerPaymentSchema.safeParse({}).success).toBe(false);
    const line = { method: 'cash', amount: '5' };
    expect(registerPaymentSchema.safeParse({ lines: [line], saleId: 'x' }).success).toBe(false);
    expect(registerPaymentSchema.safeParse({ lines: [line], status: 'paid' }).success).toBe(false);
    expect(
      registerPaymentSchema.safeParse({ lines: [{ ...line, createdAt: '2020-01-01' }] }).success,
    ).toBe(false);
  });
});

describe('voidPaymentSchema', () => {
  it('exige un motivo de hasta 200 caracteres', () => {
    expect(voidPaymentSchema.parse({ reason: '  Error de método  ' })).toEqual({
      reason: 'Error de método',
    });
    expect(voidPaymentSchema.safeParse({}).success).toBe(false);
    expect(voidPaymentSchema.safeParse({ reason: '   ' }).success).toBe(false);
    expect(voidPaymentSchema.safeParse({ reason: 'x'.repeat(201) }).success).toBe(false);
    expect(voidPaymentSchema.safeParse({ reason: 'x', status: 'valid' }).success).toBe(false);
  });
});

describe('listPendingQuerySchema', () => {
  it('usa 50 por página y valida fechas y límites', () => {
    expect(listPendingQuerySchema.parse({})).toEqual({ limit: 50, offset: 0 });
    expect(listPendingQuerySchema.safeParse({ from: 'ayer' }).success).toBe(false);
    expect(listPendingQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    expect(listPendingQuerySchema.parse({ from: '2026-10-01', to: '2026-10-15' })).toMatchObject({
      from: '2026-10-01',
      to: '2026-10-15',
    });
  });
});
