import { describe, expect, it } from 'vitest';
import {
  createProductSchema,
  listProductsQuerySchema,
  moneySchema,
  normalizeMoney,
  updateProductSchema,
} from './index';

const valid = { name: ' Tamal de rajas ', price: '25', cost: '14.5' };

describe('normalizeMoney / moneySchema', () => {
  it('normaliza a dos decimales exactos', () => {
    expect(normalizeMoney('25')).toBe('25.00');
    expect(normalizeMoney('25.5')).toBe('25.50');
    expect(normalizeMoney('007.05')).toBe('7.05');
    expect(moneySchema.parse(' 0 ')).toBe('0.00');
  });

  it('acepta el máximo de NUMERIC(12,2)', () => {
    expect(moneySchema.parse('9999999999.99')).toBe('9999999999.99');
  });

  it('rechaza negativos con un mensaje claro', () => {
    const result = moneySchema.safeParse('-5.00');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('No puede ser negativo.');
  });

  it('rechaza texto, más de 2 decimales, notación científica y números JSON', () => {
    for (const bad of ['abc', '', '1.234', '1e3', '1,5', '12345678901', '.5', '5.']) {
      expect(moneySchema.safeParse(bad).success, bad).toBe(false);
    }
    expect(moneySchema.safeParse(25.5).success).toBe(false);
  });
});

describe('createProductSchema', () => {
  it('normaliza nombre e importes y deja opcionales sin definir', () => {
    expect(createProductSchema.parse(valid)).toEqual({
      name: 'Tamal de rajas',
      price: '25.00',
      cost: '14.50',
    });
  });

  it('el costo es obligatorio, pero puede ser 0', () => {
    expect(createProductSchema.safeParse({ name: 'X', price: '1' }).success).toBe(false);
    expect(createProductSchema.safeParse({ name: 'X', price: '1', cost: '0' }).success).toBe(true);
  });

  it('rechaza nombre vacío o demasiado largo y precio o costo negativos', () => {
    expect(createProductSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...valid, name: 'x'.repeat(101) }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...valid, price: '-1' }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...valid, cost: '-0.01' }).success).toBe(false);
  });

  it('convierte textos opcionales vacíos en null y respeta los límites', () => {
    const parsed = createProductSchema.parse({ ...valid, description: '  ', code: ' TAM-01 ' });
    expect(parsed.description).toBeNull();
    expect(parsed.code).toBe('TAM-01');
    expect(createProductSchema.safeParse({ ...valid, notes: 'x'.repeat(501) }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...valid, code: 'x'.repeat(41) }).success).toBe(false);
  });

  it('rechaza campos desconocidos como tenantId, id o version', () => {
    for (const extra of [{ tenantId: 'x' }, { tenant_id: 'x' }, { id: 'x' }, { version: 3 }]) {
      expect(createProductSchema.safeParse({ ...valid, ...extra }).success).toBe(false);
    }
  });
});

describe('updateProductSchema', () => {
  it('exige version y al menos un campo por cambiar', () => {
    expect(updateProductSchema.safeParse({ name: 'Nuevo' }).success).toBe(false);
    expect(updateProductSchema.safeParse({ version: 1 }).success).toBe(false);
    expect(updateProductSchema.safeParse({ version: 1, name: 'Nuevo' }).success).toBe(true);
  });

  it('permite activar o desactivar y limpiar opcionales con null o vacío', () => {
    const parsed = updateProductSchema.parse({ version: 2, active: false, code: '', notes: null });
    expect(parsed).toEqual({ version: 2, active: false, code: null, notes: null });
  });

  it('rechaza versiones inválidas y campos desconocidos', () => {
    expect(updateProductSchema.safeParse({ version: 0, name: 'X' }).success).toBe(false);
    expect(updateProductSchema.safeParse({ version: '1', name: 'X' }).success).toBe(false);
    expect(updateProductSchema.safeParse({ version: 1, tenantId: 'x' }).success).toBe(false);
    expect(updateProductSchema.safeParse({ version: 1, name: '' }).success).toBe(false);
  });
});

describe('listProductsQuerySchema', () => {
  it('usa activos, 50 por página y desde 0 por omisión', () => {
    expect(listProductsQuerySchema.parse({})).toEqual({ status: 'active', limit: 50, offset: 0 });
  });

  it('convierte números de la query y rechaza fuera de rango o estados desconocidos', () => {
    expect(listProductsQuerySchema.parse({ limit: '10', offset: '20' })).toMatchObject({
      limit: 10,
      offset: 20,
    });
    expect(listProductsQuerySchema.safeParse({ limit: '1000' }).success).toBe(false);
    expect(listProductsQuerySchema.safeParse({ offset: '-1' }).success).toBe(false);
    expect(listProductsQuerySchema.safeParse({ status: 'borrados' }).success).toBe(false);
  });
});
