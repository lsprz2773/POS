import { describe, expect, it } from 'vitest';
import { makeOffer } from '../../test/helpers';
import { cartLines, cartTotals, sellable, setQuantity, stepQuantity } from './cart';
import type { DailyOffer } from '@pos/shared';

const offer = (overrides: Record<string, unknown> = {}) =>
  makeOffer({ price: '25.00', availableQuantity: '10', ...overrides }) as unknown as DailyOffer;

describe('borrador de la venta', () => {
  it('solo se venden productos activos con existencias', () => {
    expect(sellable(offer())).toBe(true);
    expect(sellable(offer({ availableQuantity: '0' }))).toBe(false);
    expect(sellable(offer({ productActive: false }))).toBe(false);
  });

  it('suma de uno en uno, sin pasar de lo disponible, y llegar a cero lo quita', () => {
    const tamal = offer({ availableQuantity: '2' });
    let cart = stepQuantity({}, tamal, 1);
    expect(cart).toEqual({ [tamal.productId]: '1' });
    cart = stepQuantity(stepQuantity(cart, tamal, 1), tamal, 1);
    expect(cart[tamal.productId]).toBe('2'); // tope: lo disponible
    cart = setQuantity(cart, tamal, '99');
    expect(cart[tamal.productId]).toBe('2');
    cart = stepQuantity(stepQuantity(cart, tamal, -1), tamal, -1);
    expect(cart).toEqual({});
    expect(stepQuantity({}, tamal, -1)).toEqual({});
  });

  it('admite fracciones exactas en productos que las permiten', () => {
    const queso = offer({ allowsFractions: true, availableQuantity: '5' });
    const cart = setQuantity({}, queso, '0.5');
    expect(cart[queso.productId]).toBe('0.5');
    expect(stepQuantity(cart, queso, 1)[queso.productId]).toBe('1.5');
  });

  it('calcula subtotales, total, piezas y productos con la misma aritmética del servidor', () => {
    const tamal = offer({ price: '25.00' });
    const jugo = offer({ price: '18.00', productName: 'Jugo' });
    const cart = { [tamal.productId]: '2', [jugo.productId]: '1' };
    const lines = cartLines([jugo, tamal], cart);
    expect(lines.map((l) => l.subtotal).sort()).toEqual(['18.00', '50.00']);
    expect(cartTotals(lines)).toEqual({ total: '68.00', pieces: '3', products: 2 });
    expect(cartTotals([])).toEqual({ total: '0.00', pieces: '0', products: 0 });
  });

  it('redondea el subtotal de una fracción a centavos con la mitad hacia arriba', () => {
    const queso = offer({ price: '33.33', allowsFractions: true });
    const [line] = cartLines([queso], { [queso.productId]: '0.5' });
    expect(line!.subtotal).toBe('16.67'); // 16.665
  });
});
