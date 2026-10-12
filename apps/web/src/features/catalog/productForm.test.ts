import { describe, expect, it } from 'vitest';
import { changedFields, EMPTY_FORM, validateProductForm } from './productForm';

const filled = { ...EMPTY_FORM, name: ' Tamal de rajas ', price: '25', cost: '14.5' };

describe('formulario de producto', () => {
  it('normaliza importes a 2 decimales, recorta textos y deja vacíos como null', () => {
    const result = validateProductForm(filled);
    expect(result).toEqual({
      ok: true,
      data: {
        name: 'Tamal de rajas',
        price: '25.00',
        cost: '14.50',
        unit: 'pieza',
        code: null,
        category: null,
        description: null,
        notes: null,
      },
    });
  });

  it('pide lo obligatorio con mensajes que dicen qué falta', () => {
    const result = validateProductForm(EMPTY_FORM);
    expect(result).toMatchObject({
      ok: false,
      errors: {
        name: 'Escribe el nombre del producto.',
        price: 'Escribe un importe, por ejemplo 25.00.',
        cost: 'Escribe un importe, por ejemplo 25.00.',
      },
    });
  });

  it('rechaza importes negativos o con demasiados decimales, pero acepta costo cero', () => {
    expect(validateProductForm({ ...filled, price: '-25' })).toMatchObject({
      ok: false,
      errors: { price: 'No puede ser negativo.' },
    });
    expect(validateProductForm({ ...filled, price: '25.999' })).toMatchObject({ ok: false });
    expect(validateProductForm({ ...filled, cost: '0' })).toMatchObject({ ok: true });
  });

  it('solo envía lo que cambió, y distingue vaciar un opcional de no tocarlo', () => {
    const initial = {
      name: 'A',
      price: '10.00',
      cost: '5.00',
      unit: 'pieza',
      code: 'X1',
      category: null,
    };
    const next = {
      name: 'A',
      price: '12.00',
      cost: '5.00',
      unit: 'pieza',
      code: null,
      category: null,
    };
    expect(changedFields(initial, next)).toEqual({ price: '12.00', code: null });
    expect(changedFields(initial, initial)).toEqual({});
  });
});
