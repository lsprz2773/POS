import { describe, expect, it } from 'vitest';
import { type Product } from '@pos/shared';
import { auditActionFor, diffProduct, escapeLike } from './product.domain';

const base: Product = {
  id: '5b2c1a54-7a8e-4a8e-9a55-4b0a1f6d2a10',
  name: 'Tamal de rajas',
  description: null,
  category: null,
  code: 'TAM-01',
  unit: 'pieza',
  allowsFractions: false,
  price: '25.00',
  cost: '14.00',
  notes: null,
  active: true,
  version: 1,
  createdAt: '2026-10-11T10:00:00.000Z',
  updatedAt: '2026-10-11T10:00:00.000Z',
};

describe('diffProduct', () => {
  it('no reporta cambios si lo pedido es igual a lo actual', () => {
    expect(diffProduct(base, { name: 'Tamal de rajas', price: '25.00', code: 'TAM-01' })).toEqual({
      before: {},
      after: {},
    });
    expect(diffProduct(base, {})).toEqual({ before: {}, after: {} });
  });

  it('reporta solo los campos que cambian, con valor anterior y nuevo', () => {
    expect(diffProduct(base, { price: '27.50', name: base.name, notes: 'sin picante' })).toEqual({
      before: { price: '25.00', notes: null },
      after: { price: '27.50', notes: 'sin picante' },
    });
  });

  it('distingue limpiar un campo (null) de no tocarlo (undefined)', () => {
    expect(diffProduct(base, { code: null })).toEqual({
      before: { code: 'TAM-01' },
      after: { code: null },
    });
    expect(diffProduct(base, { code: undefined })).toEqual({ before: {}, after: {} });
  });
});

describe('auditActionFor', () => {
  it('usa activate/deactivate cuando solo cambia el estado', () => {
    expect(auditActionFor(diffProduct(base, { active: false }))).toBe('deactivate');
    expect(auditActionFor(diffProduct({ ...base, active: false }, { active: true }))).toBe(
      'activate',
    );
  });

  it('usa update si cambia otra cosa, aunque también cambie el estado', () => {
    expect(auditActionFor(diffProduct(base, { name: 'Otro' }))).toBe('update');
    expect(auditActionFor(diffProduct(base, { name: 'Otro', active: false }))).toBe('update');
  });
});

describe('escapeLike', () => {
  it('escapa los comodines y la diagonal inversa', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
    expect(escapeLike('tamal')).toBe('tamal');
  });
});
