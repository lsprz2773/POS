import { describe, expect, it } from 'vitest';
import { hashPaymentRequest, hashSaleRequest, isOutsideHours, localTime } from './sale.domain';

const p1 = '5b2c1a54-7a8e-4a8e-9a55-4b0a1f6d2a10';
const p2 = '9d8c7b6a-1111-4222-8333-444455556666';

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
