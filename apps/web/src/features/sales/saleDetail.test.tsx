import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ME, STORE, apiError, makePayment, makeSale, renderApp, stubApi } from '../../test/helpers';

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-15T18:00:00Z') }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const base = { 'GET /me': { body: ME }, 'GET /store': { body: STORE } };
const user = () => userEvent.setup();

const pending = () => {
  const cash = makePayment({
    amount: '40.00',
    method: 'cash',
    createdAt: '2026-10-15T15:50:00.000Z',
  });
  const transfer = makePayment({
    amount: '20.00',
    method: 'transfer',
    createdAt: '2026-10-15T18:30:00.000Z',
  });
  const voided = makePayment({
    amount: '30.00',
    status: 'voided',
    voidedAt: '2026-10-15T17:05:00.000Z',
    voidReason: 'monto equivocado',
  });
  return makeSale({
    customerReference: 'Grupo 3B',
    note: 'Pasan por ellos al recreo',
    paid: '60.00',
    balance: '75.00',
    paymentStatus: 'partial',
    payments: [cash, transfer, voided],
  });
};

describe('detalle de venta', () => {
  it('muestra renglones congelados, totales, saldo y el historial de pagos', async () => {
    const sale = pending();
    stubApi({ ...base, [`GET /sales/${sale.id}`]: { body: sale } });
    renderApp(`/ventas/${sale.id}`);
    expect(await screen.findByRole('heading', { name: `Venta ${sale.folio}` })).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(screen.getByText('Grupo 3B')).toBeInTheDocument();
    expect(screen.getByText('Pasan por ellos al recreo')).toBeInTheDocument();
    const products = screen.getByRole('region', { name: 'Productos' });
    expect(within(products).getByText('$75.00')).toBeInTheDocument();
    expect(
      within(products).getByText('Precios congelados al momento de la venta.'),
    ).toBeInTheDocument();
    const totals = screen.getByRole('region', { name: 'Totales' });
    expect(within(totals).getByText('$135.00')).toBeInTheDocument();
    expect(within(totals).getByText('$60.00')).toBeInTheDocument();
    expect(within(totals).getByText('$75.00')).toBeInTheDocument();
    const payments = screen.getByRole('region', { name: 'Historial de pagos' });
    expect(within(payments).getAllByRole('listitem')).toHaveLength(3);
    expect(within(payments).getByText('Anulado')).toBeInTheDocument();
    expect(within(payments).getByText(/Motivo: monto equivocado/)).toBeInTheDocument();
    // Solo los pagos vigentes se pueden anular.
    expect(within(payments).getAllByRole('button', { name: /^Anular/ })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Registrar pago' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar venta' })).toBeInTheDocument();
  });

  it('una venta pagada no ofrece registrar más pagos', async () => {
    const sale = makeSale({
      paid: '135.00',
      balance: '0.00',
      paymentStatus: 'paid',
      payments: [makePayment({ amount: '135.00' })],
    });
    stubApi({ ...base, [`GET /sales/${sale.id}`]: { body: sale } });
    renderApp(`/ventas/${sale.id}`);
    expect(await screen.findByText('Pagada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar pago' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar venta' })).toBeInTheDocument();
  });

  it('una venta fuera de horario lo avisa', async () => {
    const sale = makeSale({ outsideWorkdayHours: true });
    stubApi({ ...base, [`GET /sales/${sale.id}`]: { body: sale } });
    renderApp(`/ventas/${sale.id}`);
    expect(
      await screen.findByText('Registrada fuera del horario de la jornada.'),
    ).toBeInTheDocument();
  });

  it('una venta que ya no existe lo explica', async () => {
    const id = '50000000-0000-4000-8000-0000000000ff';
    stubApi({
      ...base,
      [`GET /sales/${id}`]: apiError(404, 'not_found', 'Esa venta ya no está disponible.'),
    });
    renderApp(`/ventas/${id}`);
    expect(
      await screen.findByRole('heading', { name: 'Esta venta ya no está disponible' }),
    ).toBeInTheDocument();
  });

  it('si falla la carga ofrece reintentar', async () => {
    const sale = makeSale();
    let attempts = 0;
    stubApi({
      ...base,
      [`GET /sales/${sale.id}`]: () =>
        ++attempts === 1 ? apiError(500, 'internal_error', 'x') : { body: sale },
    });
    renderApp(`/ventas/${sale.id}`);
    expect(await screen.findByRole('alert')).toHaveTextContent('req-123');
    await user().click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: `Venta ${sale.folio}` })).toBeInTheDocument();
  });
});

describe('registrar un pago', () => {
  it('abre la hoja con total, recibido y lo que falta, y registra con llave de idempotencia', async () => {
    const sale = pending();
    const paid = { ...sale, paid: '135.00', balance: '0.00', paymentStatus: 'paid' };
    const { calls, fetchMock } = stubApi({
      ...base,
      [`GET /sales/${sale.id}`]: { body: sale },
      [`POST /sales/${sale.id}/payments`]: { status: 201, body: paid },
      'GET /sales/pending': {
        body: { items: [], total: 0, totalBalance: '0.00', limit: 50, offset: 0 },
      },
    });
    const u = user();
    renderApp(`/ventas/${sale.id}`);
    await u.click(await screen.findByRole('button', { name: 'Registrar pago' }));
    const sheet = await screen.findByRole('dialog', { name: 'Registrar pago' });
    expect(within(sheet).getByText('$135.00')).toBeInTheDocument();
    expect(within(sheet).getByLabelText('Efectivo')).toHaveValue('75.00');
    expect(within(sheet).getByText('Suma $75.00. La venta quedará pagada.')).toBeInTheDocument();
    await u.click(within(sheet).getByRole('button', { name: 'Registrar pago · $75.00' }));
    expect(await screen.findByText('Pago registrado.')).toBeInTheDocument();
    expect(calls.find((c) => c.key.endsWith('/payments'))!.body).toEqual({
      lines: [{ method: 'cash', amount: '75.00' }],
    });
    const headers = (
      fetchMock.mock.calls.find(([url]) => String(url).endsWith('/payments'))![1] as RequestInit
    ).headers as Record<string, string>;
    expect(headers['idempotency-key']).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
    expect(await screen.findByText('Pagada')).toBeInTheDocument();
  });

  it('no deja cobrar más de lo que falta', async () => {
    const sale = pending();
    stubApi({ ...base, [`GET /sales/${sale.id}`]: { body: sale } });
    const u = user();
    renderApp(`/ventas/${sale.id}`);
    await u.click(await screen.findByRole('button', { name: 'Registrar pago' }));
    const sheet = await screen.findByRole('dialog');
    const cash = within(sheet).getByLabelText('Efectivo');
    await u.clear(cash);
    await u.type(cash, '80');
    await u.click(within(sheet).getByRole('button', { name: /Registrar pago ·/ }));
    expect(within(sheet).getByText('No puedes cobrar más de $75.00.')).toBeInTheDocument();
  });

  it('un rechazo del servidor se muestra en la hoja sin cerrarla', async () => {
    const sale = pending();
    stubApi({
      ...base,
      [`GET /sales/${sale.id}`]: { body: sale },
      [`POST /sales/${sale.id}/payments`]: apiError(
        409,
        'conflict',
        'Esta venta no tiene saldo por cobrar.',
      ),
    });
    const u = user();
    renderApp(`/ventas/${sale.id}`);
    await u.click(await screen.findByRole('button', { name: 'Registrar pago' }));
    const sheet = await screen.findByRole('dialog');
    await u.click(within(sheet).getByRole('button', { name: /Registrar pago ·/ }));
    expect(
      await within(sheet).findByText('Esta venta no tiene saldo por cobrar.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('anular un pago', () => {
  it('pide motivo, muestra el efecto en el saldo y anula', async () => {
    const sale = pending();
    const target = sale.payments[0]!;
    const after = {
      ...sale,
      paid: '20.00',
      balance: '115.00',
      payments: sale.payments.map((p) =>
        p.id === target.id ? { ...p, status: 'voided', voidReason: 'método equivocado' } : p,
      ),
    };
    const { calls } = stubApi({
      ...base,
      [`GET /sales/${sale.id}`]: { body: sale },
      [`POST /payments/${target.id}/void`]: { body: after },
    });
    const u = user();
    renderApp(`/ventas/${sale.id}`);
    await u.click(await screen.findByRole('button', { name: 'Anular Efectivo $40.00' }));
    const dialog = await screen.findByRole('alertdialog', { name: '¿Anular este pago?' });
    expect(within(dialog).getByRole('button', { name: 'Volver' })).toHaveFocus();
    expect(within(dialog).getByText(/pasará de \$75\.00 a \$115\.00/)).toBeInTheDocument();
    // Sin motivo no se anula.
    await u.click(within(dialog).getByRole('button', { name: 'Anular pago' }));
    expect(within(dialog).getByLabelText('Motivo *')).toHaveAccessibleDescription(
      'Escribe el motivo de la anulación.',
    );
    expect(calls.some((c) => c.key.endsWith('/void'))).toBe(false);
    await u.type(within(dialog).getByLabelText('Motivo *'), 'método equivocado');
    await u.click(within(dialog).getByRole('button', { name: 'Anular pago' }));
    expect(await screen.findByText('Pago anulado.')).toBeInTheDocument();
    expect(calls.find((c) => c.key.endsWith('/void'))!.body).toEqual({
      reason: 'método equivocado',
    });
    expect(
      within(await screen.findByRole('region', { name: 'Totales' })).getByText('$115.00'),
    ).toBeInTheDocument();
  });

  it('Volver cierra sin anular', async () => {
    const sale = pending();
    const { calls } = stubApi({ ...base, [`GET /sales/${sale.id}`]: { body: sale } });
    const u = user();
    renderApp(`/ventas/${sale.id}`);
    await u.click(await screen.findByRole('button', { name: 'Anular Efectivo $40.00' }));
    await u.click(await screen.findByRole('button', { name: 'Volver' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(calls.some((c) => c.key.endsWith('/void'))).toBe(false);
  });
});

describe('cancelar una venta', () => {
  it('de hoy: pide motivo, avisa que lo cobrado se devuelve fuera del sistema y cancela', async () => {
    const sale = pending();
    const cancelled = {
      ...sale,
      status: 'cancelled',
      paymentStatus: 'cancelled',
      balance: '0.00',
      cancellation: {
        reason: 'Se registró dos veces',
        cancelledAt: '2026-10-15T18:00:00.000Z',
        inventoryRestored: true,
        refundDue: '60.00',
      },
    };
    const { calls } = stubApi({
      ...base,
      [`GET /sales/${sale.id}`]: { body: sale },
      [`POST /sales/${sale.id}/cancel`]: { body: cancelled },
    });
    const u = user();
    renderApp(`/ventas/${sale.id}`);
    await u.click(await screen.findByRole('button', { name: 'Cancelar venta' }));
    const dialog = await screen.findByRole('alertdialog', {
      name: `¿Cancelar la venta ${sale.folio}?`,
    });
    expect(within(dialog).getByRole('button', { name: 'Volver' })).toHaveFocus();
    expect(within(dialog).getByText(/Los \$60\.00 cobrados se conservan/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/día anterior/)).not.toBeInTheDocument();
    await u.click(within(dialog).getByRole('button', { name: 'Cancelar venta' }));
    expect(within(dialog).getByLabelText('Motivo de la cancelación *')).toHaveAccessibleDescription(
      'Escribe el motivo para poder cancelar.',
    );
    await u.type(
      within(dialog).getByLabelText('Motivo de la cancelación *'),
      'Se registró dos veces',
    );
    await u.click(within(dialog).getByRole('button', { name: 'Cancelar venta' }));
    expect(await screen.findByText('Venta cancelada.')).toBeInTheDocument();
    expect(calls.find((c) => c.key.endsWith('/cancel'))!.body).toEqual({
      reason: 'Se registró dos veces',
    });
    // La venta queda cancelada: sin acciones, con el motivo y lo que se devuelve fuera del sistema.
    expect(await screen.findByText('Por devolver fuera del sistema: $60.00')).toBeInTheDocument();
    expect(screen.getByText(/Motivo: Se registró dos veces/)).toBeInTheDocument();
    expect(screen.getByText('Las piezas volvieron al inventario.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar pago' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Anular/ })).not.toBeInTheDocument();
  });

  it('de un día anterior advierte que el inventario no se restituye', async () => {
    const sale = makeSale({ date: '2026-10-12' });
    stubApi({ ...base, [`GET /sales/${sale.id}`]: { body: sale } });
    const u = user();
    renderApp(`/ventas/${sale.id}`);
    await u.click(await screen.findByRole('button', { name: 'Cancelar venta' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(
      within(dialog).getByText(/Esta venta es de un día anterior: el inventario no se restituye/),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/cobrados se conservan/)).not.toBeInTheDocument();
  });

  it('cancelar dos veces: el servidor responde conflicto y se muestra', async () => {
    const sale = makeSale();
    stubApi({
      ...base,
      [`GET /sales/${sale.id}`]: { body: sale },
      [`POST /sales/${sale.id}/cancel`]: apiError(
        409,
        'conflict',
        'Esta venta ya estaba cancelada.',
      ),
    });
    const u = user();
    renderApp(`/ventas/${sale.id}`);
    await u.click(await screen.findByRole('button', { name: 'Cancelar venta' }));
    const dialog = await screen.findByRole('alertdialog');
    await u.type(within(dialog).getByLabelText('Motivo de la cancelación *'), 'x');
    await u.click(within(dialog).getByRole('button', { name: 'Cancelar venta' }));
    expect(await within(dialog).findByText('Esta venta ya estaba cancelada.')).toBeInTheDocument();
  });

  it('una venta cancelada de un día anterior explica que no se restituyó el inventario', async () => {
    const sale = makeSale({
      status: 'cancelled',
      paymentStatus: 'cancelled',
      balance: '0.00',
      cancellation: {
        reason: 'Error',
        cancelledAt: '2026-10-15T18:00:00.000Z',
        inventoryRestored: false,
        refundDue: '0.00',
      },
    });
    stubApi({ ...base, [`GET /sales/${sale.id}`]: { body: sale } });
    renderApp(`/ventas/${sale.id}`);
    expect(await screen.findByText('Venta cancelada')).toBeInTheDocument();
    expect(
      screen.getByText('El inventario no se restituyó porque la venta es de un día anterior.'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Cancelada').length).toBeGreaterThan(0);
  });
});
