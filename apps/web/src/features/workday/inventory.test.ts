import { describe, expect, it } from 'vitest';
import { dayQuantity, soldPercent, stockLevel } from './inventory';

const offer = (initial: string, adjusted: string, sold: string, available: string) => ({
  initialQuantity: initial,
  adjustedQuantity: adjusted,
  soldQuantity: sold,
  availableQuantity: available,
});

describe('inventario del día', () => {
  it('la cantidad del día suma los aumentos a la inicial', () => {
    expect(dayQuantity(offer('40', '10', '0', '50'))).toBe('50');
    expect(dayQuantity(offer('2.5', '0.25', '0', '2.75'))).toBe('2.75');
  });

  it('agotado sin existencias, pocas con el 20 % o menos, disponible en el resto', () => {
    expect(stockLevel(offer('20', '0', '20', '0'))).toBe('soldout');
    expect(stockLevel(offer('24', '0', '20', '4'))).toBe('low');
    expect(stockLevel(offer('20', '0', '16', '4'))).toBe('low'); // justo 20 %
    expect(stockLevel(offer('20', '0', '15', '5'))).toBe('available');
    expect(stockLevel(offer('40', '0', '18', '22'))).toBe('available');
    expect(stockLevel(offer('0', '0', '0', '0'))).toBe('soldout');
  });

  it('un aumento reabre un producto agotado y se mide contra el total del día', () => {
    expect(stockLevel(offer('20', '10', '20', '10'))).toBe('available');
    expect(stockLevel(offer('20', '5', '24', '1'))).toBe('low');
  });

  it('el porcentaje vendido nunca pasa de 100 y no divide entre cero', () => {
    expect(soldPercent(offer('40', '0', '18', '22'))).toBe(45);
    expect(soldPercent(offer('20', '0', '20', '0'))).toBe(100);
    expect(soldPercent(offer('0', '0', '0', '0'))).toBe(0);
  });
});
