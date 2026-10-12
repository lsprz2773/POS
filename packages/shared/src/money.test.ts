import { describe, expect, it } from 'vitest';
import {
  availableQuantity,
  balanceOf,
  collectionStatus,
  formatFolio,
  formatMoney,
  fromCents,
  fromMilli,
  isWholeQuantity,
  lineSubtotal,
  sumMoney,
  sumQuantities,
  toCents,
  toMilli,
} from './money';

describe('cantidades exactas', () => {
  it('convierte a milésimas y de vuelta sin ceros sobrantes', () => {
    expect(toMilli('40')).toBe(40_000n);
    expect(toMilli('2.5')).toBe(2_500n);
    expect(toMilli('0.001')).toBe(1n);
    expect(fromMilli(40_000n)).toBe('40');
    expect(fromMilli(2_500n)).toBe('2.5');
    expect(fromMilli(1n)).toBe('0.001');
    expect(fromMilli(0n)).toBe('0');
  });

  it('suma decimales sin errores de redondeo', () => {
    expect(sumQuantities(['0.1', '0.2'])).toBe('0.3');
    expect(sumQuantities([])).toBe('0');
    expect(sumQuantities(['10', '5', '2.25'])).toBe('17.25');
  });

  it('calcula el disponible = inicial + aumentos − vendido', () => {
    expect(availableQuantity({ initial: '40', adjusted: '10', sold: '18' })).toBe('32');
    expect(availableQuantity({ initial: '2.5', adjusted: '0', sold: '0.5' })).toBe('2');
  });

  it('el disponible nunca es negativo', () => {
    expect(availableQuantity({ initial: '5', adjusted: '0', sold: '9' })).toBe('0');
  });

  it('distingue cantidades enteras de fraccionarias', () => {
    expect(isWholeQuantity('12')).toBe(true);
    expect(isWholeQuantity('12.000')).toBe(true);
    expect(isWholeQuantity('12.5')).toBe(false);
  });
});

describe('dinero en centavos exactos', () => {
  it('convierte de ida y vuelta', () => {
    expect(toCents('25.50')).toBe(2550n);
    expect(toCents('0.05')).toBe(5n);
    expect(toCents('7')).toBe(700n);
    expect(fromCents(2550n)).toBe('25.50');
    expect(fromCents(5n)).toBe('0.05');
    expect(fromCents(0n)).toBe('0.00');
  });

  it('suma sin errores de punto flotante', () => {
    expect(sumMoney(['0.10', '0.20'])).toBe('0.30');
    expect(sumMoney(['50.00', '18.00'])).toBe('68.00');
    expect(sumMoney([])).toBe('0.00');
  });
});

describe('subtotal del renglón', () => {
  it('es exacto con piezas enteras', () => {
    expect(lineSubtotal('2', '25.00')).toBe('50.00');
    expect(lineSubtotal('3', '18.50')).toBe('55.50');
    expect(lineSubtotal('0', '25.00')).toBe('0.00');
  });

  it('con decimales redondea a centavos con la mitad hacia arriba', () => {
    expect(lineSubtotal('2.5', '25.00')).toBe('62.50');
    expect(lineSubtotal('0.333', '9.99')).toBe('3.33'); // 3.32667
    expect(lineSubtotal('0.5', '0.01')).toBe('0.01'); // 0.005 sube
    expect(lineSubtotal('0.4', '0.01')).toBe('0.00'); // 0.004 baja
  });
});

describe('folio', () => {
  it('es legible y crece sin tope', () => {
    expect(formatFolio(1)).toBe('V-0001');
    expect(formatFolio(43)).toBe('V-0043');
    expect(formatFolio(12345)).toBe('V-12345');
  });
});

describe('saldo y estado de cobro', () => {
  it('saldo = total − pagado, con centavos exactos', () => {
    expect(balanceOf('75.00', '0.00')).toBe('75.00');
    expect(balanceOf('75.00', '30.10')).toBe('44.90');
    expect(balanceOf('75.00', '75.00')).toBe('0.00');
  });

  it('pendiente sin pagos, parcial con pagos y pagada solo sin saldo', () => {
    const sale = { status: 'active' as const, total: '100.00' };
    expect(collectionStatus({ ...sale, paid: '0.00' })).toBe('pending');
    expect(collectionStatus({ ...sale, paid: '0.01' })).toBe('partial');
    expect(collectionStatus({ ...sale, paid: '99.99' })).toBe('partial');
    expect(collectionStatus({ ...sale, paid: '100.00' })).toBe('paid');
  });

  it('una venta cancelada siempre es cancelada', () => {
    expect(collectionStatus({ status: 'cancelled', total: '100.00', paid: '100.00' })).toBe(
      'cancelled',
    );
    expect(collectionStatus({ status: 'cancelled', total: '100.00', paid: '0.00' })).toBe(
      'cancelled',
    );
  });

  it('una venta de total cero no tiene saldo: cuenta como pagada y no queda pendiente', () => {
    expect(collectionStatus({ status: 'active', total: '0.00', paid: '0.00' })).toBe('paid');
  });
});

describe('formato de moneda', () => {
  it('da formato de pesos con miles y 2 decimales', () => {
    expect(formatMoney('75.00', 'MXN')).toBe('$75.00');
    expect(formatMoney('1285.5', 'MXN')).toBe('$1,285.50');
    expect(formatMoney('0.00', 'MXN')).toBe('$0.00');
  });
});
