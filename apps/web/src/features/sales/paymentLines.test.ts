import { describe, expect, it } from 'vitest';
import { checkPayment, draftFor } from './paymentLines';

const money = (amount: string) => `$${amount}`;

describe('pago de una venta', () => {
  it('por omisión cobra todo lo que falta en el método elegido', () => {
    expect(draftFor('cash', '75.00')).toEqual({ method: 'cash', cash: '75.00', transfer: '' });
    expect(draftFor('transfer', '75.00')).toEqual({
      method: 'transfer',
      cash: '',
      transfer: '75.00',
    });
    expect(draftFor('mixed', '75.00')).toEqual({ method: 'mixed', cash: '75.00', transfer: '' });
  });

  it('efectivo o transferencia: un renglón con el importe normalizado', () => {
    expect(checkPayment(draftFor('cash', '68.00'), '68.00', money)).toEqual({
      ok: true,
      lines: [{ method: 'cash', amount: '68.00' }],
      paid: '68.00',
      remaining: '0.00',
    });
    expect(
      checkPayment({ method: 'transfer', cash: '', transfer: '20' }, '68.00', money),
    ).toMatchObject({
      ok: true,
      lines: [{ method: 'transfer', amount: '20.00' }],
      remaining: '48.00',
    });
  });

  it('mixto: suma las dos partes y basta con que una tenga importe', () => {
    expect(
      checkPayment({ method: 'mixed', cash: '50', transfer: '25' }, '75.00', money),
    ).toMatchObject({
      ok: true,
      paid: '75.00',
      remaining: '0.00',
      lines: [
        { method: 'cash', amount: '50.00' },
        { method: 'transfer', amount: '25.00' },
      ],
    });
    expect(
      checkPayment({ method: 'mixed', cash: '', transfer: '25' }, '75.00', money),
    ).toMatchObject({
      ok: true,
      lines: [{ method: 'transfer', amount: '25.00' }],
    });
  });

  it('nunca deja cobrar más de lo que falta', () => {
    expect(checkPayment({ method: 'mixed', cash: '50', transfer: '30' }, '75.00', money)).toEqual({
      ok: false,
      errors: { form: 'No puedes cobrar más de $75.00.' },
      paid: '80.00',
    });
  });

  it('rechaza importes vacíos, en cero, negativos o con demasiados decimales, indicando el campo', () => {
    expect(checkPayment({ method: 'cash', cash: '', transfer: '' }, '10.00', money)).toMatchObject({
      ok: false,
      errors: { cash: 'Escribe un importe.' },
    });
    expect(checkPayment({ method: 'cash', cash: '0', transfer: '' }, '10.00', money)).toMatchObject(
      {
        ok: false,
        errors: { cash: 'El importe debe ser mayor que cero.' },
      },
    );
    expect(
      checkPayment({ method: 'transfer', cash: '', transfer: '-5' }, '10.00', money),
    ).toMatchObject({
      ok: false,
      errors: { transfer: 'No puede ser negativo.' },
    });
    expect(
      checkPayment({ method: 'cash', cash: '1.234', transfer: '' }, '10.00', money),
    ).toMatchObject({
      ok: false,
    });
  });

  it('mixto sin ningún importe pide al menos uno', () => {
    expect(checkPayment({ method: 'mixed', cash: '', transfer: '' }, '10.00', money)).toMatchObject(
      {
        ok: false,
        errors: { form: 'Indica al menos un importe.' },
      },
    );
  });
});
