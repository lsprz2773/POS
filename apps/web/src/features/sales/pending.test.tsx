import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ME, STORE, apiError, makeSale, pendingItem, renderApp, stubApi } from '../../test/helpers';

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-15T18:00:00Z') }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const base = { 'GET /me': { body: ME }, 'GET /store': { body: STORE } };
const list = (items: unknown[], total = items.length, totalBalance = '300.00', offset = 0) => ({
  body: { items, total, totalBalance, limit: 50, offset },
});

describe('pendientes', () => {
  const today = makeSale({
    folio: 'V-0041',
    customerReference: 'Grupo 3B',
    paid: '60.00',
    balance: '75.00',
    paymentStatus: 'partial',
  });
  const older = makeSale({
    folio: 'V-0038',
    date: '2026-10-14',
    customerReference: 'Mtra. Ana',
    total: '90.00',
    balance: '90.00',
  });

  it('muestra lo que falta por cobrar y cada venta con su saldo, incluidas las de días anteriores', async () => {
    stubApi({
      ...base,
      'GET /sales/pending': list([pendingItem(today), pendingItem(older)], 2, '165.00'),
    });
    renderApp('/pendientes');
    const summary = await screen.findByRole('region', { name: 'Falta por cobrar' });
    expect(within(summary).getByText('$165.00')).toBeInTheDocument();
    expect(within(summary).getByText('2 ventas')).toBeInTheDocument();
    const cards = screen.getAllByRole('listitem');
    expect(within(cards[0]!).getByText('V-0041')).toBeInTheDocument();
    expect(within(cards[0]!).getByText(/Grupo 3B/)).toBeInTheDocument();
    expect(within(cards[0]!).getByText('$135.00')).toBeInTheDocument();
    expect(within(cards[0]!).getByText('$60.00')).toBeInTheDocument();
    expect(within(cards[0]!).getByText('$75.00')).toBeInTheDocument();
    expect(within(cards[0]!).queryByText('Día anterior')).not.toBeInTheDocument();
    expect(within(cards[1]!).getByText('Día anterior')).toBeInTheDocument();
    expect(within(cards[0]!).getByRole('link', { name: 'Registrar pago V-0041' })).toHaveAttribute(
      'href',
      `/ventas/${today.id}`,
    );
  });

  it('sin pendientes celebra', async () => {
    stubApi({ ...base, 'GET /sales/pending': list([], 0, '0.00') });
    renderApp('/pendientes');
    expect(await screen.findByRole('heading', { name: '¡Todo cobrado!' })).toBeInTheDocument();
  });

  it('el filtro por fecha pide ese rango al servidor y se puede quitar', async () => {
    const { calls } = stubApi({
      ...base,
      'GET /sales/pending': list([pendingItem(today)], 1, '75.00'),
    });
    const u = userEvent.setup();
    renderApp('/pendientes');
    await screen.findByText('V-0041');
    await u.click(screen.getByRole('button', { name: 'Todas las fechas' }));
    const sheet = await screen.findByRole('dialog', { name: 'Filtrar por fecha de venta' });
    await u.click(within(sheet).getByRole('button', { name: 'Ayer' }));
    expect(within(sheet).getByLabelText('Desde')).toHaveValue('2026-10-14');
    await u.click(within(sheet).getByRole('button', { name: 'Aplicar filtro' }));
    await waitFor(() =>
      expect(calls.some((c) => c.url.includes('from=2026-10-14&to=2026-10-14'))).toBe(true),
    );
    expect(screen.getByRole('button', { name: /14 oct 2026/ })).toBeInTheDocument();
  });

  it('un rango invertido se explica en el campo', async () => {
    stubApi({ ...base, 'GET /sales/pending': list([pendingItem(today)], 1, '75.00') });
    const u = userEvent.setup();
    renderApp('/pendientes');
    await screen.findByText('V-0041');
    await u.click(screen.getByRole('button', { name: 'Todas las fechas' }));
    const sheet = await screen.findByRole('dialog');
    await u.type(within(sheet).getByLabelText('Desde'), '2026-10-10');
    await u.type(within(sheet).getByLabelText('Hasta'), '2026-10-01');
    await u.click(within(sheet).getByRole('button', { name: 'Aplicar filtro' }));
    expect(within(sheet).getByLabelText('Hasta')).toHaveAccessibleDescription(
      'La fecha final no puede ser anterior a la inicial.',
    );
  });

  it('un filtro sin resultados lo explica y permite mostrar todas', async () => {
    stubApi({
      ...base,
      'GET /sales/pending': list([], 0, '0.00'),
    });
    const u = userEvent.setup();
    renderApp('/pendientes');
    await screen.findByRole('heading', { name: '¡Todo cobrado!' });
    await u.click(screen.getByRole('button', { name: 'Todas las fechas' }));
    const sheet = await screen.findByRole('dialog');
    await u.click(within(sheet).getByRole('button', { name: 'Hoy' }));
    await u.click(within(sheet).getByRole('button', { name: 'Aplicar filtro' }));
    expect(
      await screen.findByRole('heading', { name: 'No hay pendientes en esas fechas' }),
    ).toBeInTheDocument();
  });

  it('carga más de 50 ventas por partes', async () => {
    const first = Array.from({ length: 50 }, (_, i) =>
      pendingItem(makeSale({ folio: `V-${String(100 + i).padStart(4, '0')}` })),
    );
    const { calls } = stubApi({
      ...base,
      'GET /sales/pending': () =>
        calls.some((c) => c.url.includes('offset=50'))
          ? list([pendingItem(makeSale({ folio: 'V-0999' }))], 51, '999.00', 50)
          : list(first, 51, '999.00', 0),
    });
    const u = userEvent.setup();
    renderApp('/pendientes');
    await screen.findByText('V-0100');
    await u.click(screen.getByRole('button', { name: 'Cargar más' }));
    expect(await screen.findByText('V-0999')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('si falla la carga ofrece reintentar', async () => {
    let attempts = 0;
    stubApi({
      ...base,
      'GET /sales/pending': () =>
        ++attempts === 1
          ? apiError(500, 'internal_error', 'x')
          : list([pendingItem(today)], 1, '75.00'),
    });
    renderApp('/pendientes');
    expect(await screen.findByRole('alert')).toHaveTextContent('req-123');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('V-0041')).toBeInTheDocument();
  });
});
