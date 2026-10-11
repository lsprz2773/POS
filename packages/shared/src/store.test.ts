import { describe, expect, it } from 'vitest';
import { storeSettingsSchema, storeSettingsUpdateSchema } from './index';

const valid = {
  name: ' Tienda escolar ',
  currency: 'MXN',
  timezone: 'America/Mexico_City',
  workdayStart: '08:00',
  workdayEnd: '16:00',
  operatingDays: [5, 1, 3],
};

describe('storeSettingsSchema', () => {
  it('normaliza nombre y ordena los días', () => {
    const result = storeSettingsSchema.parse(valid);
    expect(result.name).toBe('Tienda escolar');
    expect(result.operatingDays).toEqual([1, 3, 5]);
  });

  it('rechaza una hora de fin anterior o igual a la de inicio', () => {
    expect(storeSettingsSchema.safeParse({ ...valid, workdayEnd: '08:00' }).success).toBe(false);
    expect(storeSettingsSchema.safeParse({ ...valid, workdayEnd: '07:59' }).success).toBe(false);
  });

  it('rechaza zonas horarias, monedas y horas inválidas', () => {
    expect(storeSettingsSchema.safeParse({ ...valid, timezone: 'Marte/Olimpo' }).success).toBe(
      false,
    );
    expect(storeSettingsSchema.safeParse({ ...valid, currency: 'USD' }).success).toBe(false);
    expect(storeSettingsSchema.safeParse({ ...valid, workdayStart: '25:00' }).success).toBe(false);
  });

  it('rechaza días fuera de rango, vacíos o repetidos', () => {
    expect(storeSettingsSchema.safeParse({ ...valid, operatingDays: [] }).success).toBe(false);
    expect(storeSettingsSchema.safeParse({ ...valid, operatingDays: [0] }).success).toBe(false);
    expect(storeSettingsSchema.safeParse({ ...valid, operatingDays: [8] }).success).toBe(false);
    expect(storeSettingsSchema.safeParse({ ...valid, operatingDays: [1, 1] }).success).toBe(false);
  });

  it('rechaza nombre vacío o demasiado largo', () => {
    expect(storeSettingsSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false);
    expect(storeSettingsSchema.safeParse({ ...valid, name: 'x'.repeat(101) }).success).toBe(false);
  });
});

describe('storeSettingsUpdateSchema', () => {
  it('acepta cambios parciales', () => {
    expect(storeSettingsUpdateSchema.parse({ name: 'Nueva' })).toEqual({ name: 'Nueva' });
  });

  it('rechaza un cuerpo vacío', () => {
    expect(storeSettingsUpdateSchema.safeParse({}).success).toBe(false);
  });

  it('rechaza campos desconocidos como tenantId', () => {
    expect(storeSettingsUpdateSchema.safeParse({ name: 'X', tenantId: 'otro' }).success).toBe(
      false,
    );
  });
});
