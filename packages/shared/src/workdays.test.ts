import { describe, expect, it } from 'vitest';
import {
  addAdjustmentSchema,
  addOfferSchema,
  listWorkdaysQuerySchema,
  normalizeQuantity,
  quantitySchema,
  updateWorkdayHoursSchema,
  workdayDateParamSchema,
} from './index';

const productId = '5b2c1a54-7a8e-4a8e-9a55-4b0a1f6d2a10';

describe('normalizeQuantity / quantitySchema', () => {
  it('quita ceros sobrantes', () => {
    expect(normalizeQuantity('40.000')).toBe('40');
    expect(normalizeQuantity('007')).toBe('7');
    expect(normalizeQuantity('2.50')).toBe('2.5');
    expect(normalizeQuantity('0.000')).toBe('0');
  });

  it('acepta cero y hasta 3 decimales', () => {
    expect(quantitySchema.parse('0')).toBe('0');
    expect(quantitySchema.parse(' 12.345 ')).toBe('12.345');
  });

  it('rechaza negativos, texto, más decimales, notación científica y números JSON', () => {
    const negative = quantitySchema.safeParse('-1');
    expect(negative.error?.issues[0]?.message).toBe('No puede ser negativa.');
    for (const bad of ['', 'abc', '1.2345', '1e3', '1,5', '1234567890', '.5']) {
      expect(quantitySchema.safeParse(bad).success, bad).toBe(false);
    }
    expect(quantitySchema.safeParse(5).success).toBe(false);
  });
});

describe('esquemas de jornada', () => {
  it('acepta "today" o una fecha real', () => {
    expect(workdayDateParamSchema.safeParse('today').success).toBe(true);
    expect(workdayDateParamSchema.safeParse('2026-10-15').success).toBe(true);
    for (const bad of ['hoy', '2026-02-30', '15-10-2026', '2026-13-01', '']) {
      expect(workdayDateParamSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it('addOfferSchema exige producto y cantidad y rechaza campos desconocidos', () => {
    expect(addOfferSchema.parse({ productId, quantity: '40.0' })).toEqual({
      productId,
      quantity: '40',
    });
    expect(addOfferSchema.safeParse({ productId: 'x', quantity: '1' }).success).toBe(false);
    expect(addOfferSchema.safeParse({ productId }).success).toBe(false);
    expect(addOfferSchema.safeParse({ productId, quantity: '1', tenantId: 'x' }).success).toBe(
      false,
    );
  });

  it('addAdjustmentSchema exige un aumento mayor que cero y un motivo', () => {
    expect(addAdjustmentSchema.parse({ increment: '10', reason: ' Más producto ' })).toEqual({
      increment: '10',
      reason: 'Más producto',
    });
    expect(addAdjustmentSchema.safeParse({ increment: '0', reason: 'x' }).success).toBe(false);
    expect(addAdjustmentSchema.safeParse({ increment: '-3', reason: 'x' }).success).toBe(false);
    expect(addAdjustmentSchema.safeParse({ increment: '3', reason: '  ' }).success).toBe(false);
    expect(addAdjustmentSchema.safeParse({ increment: '3', reason: 'x'.repeat(201) }).success).toBe(
      false,
    );
  });

  it('updateWorkdayHoursSchema pide al menos una hora válida', () => {
    expect(updateWorkdayHoursSchema.safeParse({}).success).toBe(false);
    expect(updateWorkdayHoursSchema.safeParse({ startTime: '25:00' }).success).toBe(false);
    expect(updateWorkdayHoursSchema.safeParse({ endTime: '9:00' }).success).toBe(false);
    expect(updateWorkdayHoursSchema.safeParse({ startTime: '07:30' }).success).toBe(true);
  });

  it('listWorkdaysQuerySchema usa 30 por página y valida fechas y rangos de página', () => {
    expect(listWorkdaysQuerySchema.parse({})).toEqual({ limit: 30, offset: 0 });
    expect(listWorkdaysQuerySchema.safeParse({ from: 'ayer' }).success).toBe(false);
    expect(listWorkdaysQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });
});
