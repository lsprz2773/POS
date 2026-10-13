import { describe, expect, it } from 'vitest';
import { cancelSaleSchema, createSaleSchema, idempotencyKeySchema } from './index';

const p1 = '5b2c1a54-7a8e-4a8e-9a55-4b0a1f6d2a10';
const p2 = '9d8c7b6a-1111-4222-8333-444455556666';

describe('idempotencyKeySchema', () => {
  it('acepta llaves de 8 a 128 caracteres seguros', () => {
    expect(idempotencyKeySchema.safeParse('5b2c1a54-7a8e-4a8e-9a55-4b0a1f6d2a10').success).toBe(
      true,
    );
    expect(idempotencyKeySchema.safeParse('abcd1234').success).toBe(true);
  });

  it('rechaza ausentes, cortas, largas o con caracteres raros', () => {
    for (const bad of [undefined, '', 'corta', 'x'.repeat(129), 'con espacios 123', 'ñandú-1234']) {
      expect(idempotencyKeySchema.safeParse(bad).success, String(bad)).toBe(false);
    }
  });
});

describe('createSaleSchema', () => {
  const item = { productId: p1, quantity: '2' };

  it('acepta renglones y normaliza cantidades, cliente y nota', () => {
    expect(
      createSaleSchema.parse({
        items: [{ productId: p1, quantity: '2.0' }],
        customerReference: '  Ana ',
        note: '  ',
      }),
    ).toEqual({ items: [item], customerReference: 'Ana', note: null });
  });

  it('exige al menos un renglón y como máximo 50', () => {
    expect(createSaleSchema.safeParse({ items: [] }).success).toBe(false);
    expect(createSaleSchema.safeParse({}).success).toBe(false);
    const many = Array.from({ length: 51 }, (_, i) => ({
      productId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      quantity: '1',
    }));
    expect(createSaleSchema.safeParse({ items: many }).success).toBe(false);
  });

  it('rechaza cantidades cero, negativas o no numéricas', () => {
    for (const quantity of ['0', '-1', 'abc', '', '1.2345']) {
      expect(
        createSaleSchema.safeParse({ items: [{ productId: p1, quantity }] }).success,
        quantity,
      ).toBe(false);
    }
  });

  it('marca el renglón repetido', () => {
    const result = createSaleSchema.safeParse({
      items: [item, { productId: p2, quantity: '1' }, item],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['items', 2, 'productId']);
  });

  it('rechaza precio, subtotal, total, estado, folio y tenant enviados por el cliente', () => {
    for (const extra of [
      { total: '1' },
      { status: 'cancelled' },
      { folio: 1 },
      { tenantId: 'x' },
      { createdAt: '2020-01-01' },
    ]) {
      expect(createSaleSchema.safeParse({ items: [item], ...extra }).success).toBe(false);
    }
    for (const extra of [{ price: '1' }, { unitPrice: '1' }, { subtotal: '1' }, { name: 'x' }]) {
      expect(createSaleSchema.safeParse({ items: [{ ...item, ...extra }] }).success).toBe(false);
    }
  });

  it('respeta los límites de cliente y nota', () => {
    expect(
      createSaleSchema.safeParse({ items: [item], customerReference: 'x'.repeat(101) }).success,
    ).toBe(false);
    expect(createSaleSchema.safeParse({ items: [item], note: 'x'.repeat(501) }).success).toBe(
      false,
    );
  });
});

describe('cancelSaleSchema', () => {
  it('exige un motivo de 1 a 200 caracteres y lo recorta', () => {
    expect(cancelSaleSchema.parse({ reason: '  Duplicada ' })).toEqual({ reason: 'Duplicada' });
    for (const reason of [undefined, '', '   ', 'x'.repeat(201), 5]) {
      expect(cancelSaleSchema.safeParse({ reason }).success).toBe(false);
    }
  });

  it('rechaza campos que no son suyos', () => {
    expect(cancelSaleSchema.safeParse({ reason: 'ok', status: 'active' }).success).toBe(false);
    expect(cancelSaleSchema.safeParse({ reason: 'ok', tenantId: 'x' }).success).toBe(false);
  });
});
