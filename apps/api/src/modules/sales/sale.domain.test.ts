import { describe, expect, it } from 'vitest';
import {
  balanceOf,
  collectionStatus,
  formatFolio,
  formatMoney,
  hashPaymentRequest,
  fromCents,
  hashSaleRequest,
  isOutsideHours,
  lineSubtotal,
  localTime,
  sumMoney,
  toCents,
} from './sale.domain';

const p1 = '5b2c1a54-7a8e-4a8e-9a55-4b0a1f6d2a10';
const p2 = '9d8c7b6a-1111-4222-8333-444455556666';

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

describe('huella de la solicitud', () => {
  const base = {
    items: [
      { productId: p1, quantity: '2' },
      { productId: p2, quantity: '1' },
    ],
  };

  it('no depende del orden de los renglones', () => {
    const reversed = { items: [...base.items].reverse() };
    expect(hashSaleRequest(base)).toBe(hashSaleRequest(reversed));
  });

  it('cambia con la cantidad, el producto, la referencia o la nota', () => {
    const hash = hashSaleRequest(base);
    expect(hashSaleRequest({ items: [{ productId: p1, quantity: '3' }, base.items[1]!] })).not.toBe(
      hash,
    );
    expect(hashSaleRequest({ items: [base.items[0]!] })).not.toBe(hash);
    expect(hashSaleRequest({ ...base, customerReference: 'Ana' })).not.toBe(hash);
    expect(hashSaleRequest({ ...base, note: 'x' })).not.toBe(hash);
  });

  it('trata ausente y null como lo mismo', () => {
    expect(hashSaleRequest({ ...base, note: null })).toBe(hashSaleRequest(base));
  });
});

describe('horario de la jornada', () => {
  const hours = { startTime: '08:00', endTime: '16:00' };

  it('usa la hora local de la tienda', () => {
    expect(localTime('America/Mexico_City', new Date('2026-10-15T18:00:00Z'))).toBe('12:00');
    expect(localTime('UTC', new Date('2026-10-15T18:00:00Z'))).toBe('18:00');
  });

  it('avisa fuera de horario y no en el borde de apertura; el cierre ya es fuera', () => {
    const at = (utc: string) => new Date(`2026-10-15T${utc}:00Z`);
    expect(isOutsideHours('America/Mexico_City', at('14:00'), hours)).toBe(false); // 08:00
    expect(isOutsideHours('America/Mexico_City', at('13:59'), hours)).toBe(true); // 07:59
    expect(isOutsideHours('America/Mexico_City', at('21:59'), hours)).toBe(false); // 15:59
    expect(isOutsideHours('America/Mexico_City', at('22:00'), hours)).toBe(true); // 16:00
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

describe('huella de un pago', () => {
  const saleId = '5b2c1a54-7a8e-4a8e-9a55-4b0a1f6d2a10';
  const mixed = [
    { method: 'cash' as const, amount: '30.00' },
    { method: 'transfer' as const, amount: '20.00' },
  ];

  it('no depende del orden de los renglones', () => {
    expect(hashPaymentRequest(saleId, mixed)).toBe(
      hashPaymentRequest(saleId, [...mixed].reverse()),
    );
  });

  it('cambia con la venta, el método o el importe', () => {
    const hash = hashPaymentRequest(saleId, mixed);
    expect(hashPaymentRequest('9d8c7b6a-1111-4222-8333-444455556666', mixed)).not.toBe(hash);
    expect(hashPaymentRequest(saleId, [mixed[0]!])).not.toBe(hash);
    expect(hashPaymentRequest(saleId, [{ method: 'cash', amount: '31.00' }, mixed[1]!])).not.toBe(
      hash,
    );
  });
});

describe('huella de la venta con pagos', () => {
  const items = [{ productId: p1, quantity: '2' }];

  it('incluye los pagos solo cuando existen, sin alterar la huella de ventas sin pago', () => {
    const plain = hashSaleRequest({ items });
    expect(hashSaleRequest({ items, payments: undefined })).toBe(plain);
    const withPayment = hashSaleRequest({ items, payments: [{ method: 'cash', amount: '50.00' }] });
    expect(withPayment).not.toBe(plain);
    expect(hashSaleRequest({ items, payments: [{ method: 'cash', amount: '40.00' }] })).not.toBe(
      withPayment,
    );
  });
});
