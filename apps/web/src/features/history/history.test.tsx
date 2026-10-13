import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ME, STORE, apiError, renderApp, saleSummary, stubApi } from '../../test/helpers';

afterEach(() => vi.unstubAllGlobals());

const base = { 'GET /me': { body: ME }, 'GET /store': { body: STORE } };
const list = (items: unknown[], total = items.length, offset = 0) => ({
  body: { items, total, limit: 50, offset },
});

describe('historial', () => {
  const paid = saleSummary({ folio: 'V-0043', customerReference: 'Mtra. Ana' });
  const pending = saleSummary({
    folio: 'V-0041',
    customerReference: 'Grupo 3B',
    total: '135.00',
    paid: '60.00',
    balance: '75.00',
    paymentStatus: 'partial',
  });
  const cancelled = saleSummary({
    folio: 'V-0040',
    total: '54.00',
    status: 'cancelled',
    paymentStatus: 'cancelled',
    balance: '0.00',
  });

  it('lista las ventas con folio, fecha y hora local, cliente, total y estado con texto', async () => {
    stubApi({ ...base, 'GET /sales': list([paid, pending, cancelled]) });
    renderApp('/historial');
    const row = (await screen.findByText('V-0043')).closest('a')!;
    expect(row).toHaveTextContent('15 oct 2026, 10:20');
    expect(row).toHaveTextContent('Mtra. Ana');
    expect(row).toHaveTextContent('$68.00');
    expect(within(row).getByText('Pagada')).toBeInTheDocument();
    expect(row).toHaveAttribute('href', `/ventas/${paid.id}`);
    expect(
      within(screen.getByText('V-0041').closest('a')!).getByText('Pendiente'),
    ).toBeInTheDocument();
    const gone = screen.getByText('V-0040').closest('a')!;
    expect(within(gone).getByText('Cancelada')).toBeInTheDocument();
    expect(gone).toHaveTextContent('Sin referencia');
    expect(screen.getByRole('status')).toHaveTextContent('3 ventas');
  });

  it('cada filtro pide al servidor el estado y el cobro que le corresponden', async () => {
    const { calls } = stubApi({ ...base, 'GET /sales': list([paid]) });
    const u = userEvent.setup();
    renderApp('/historial');
    await screen.findByText('V-0043');
    const last = () => calls.filter((c) => c.key === 'GET /sales').at(-1)!.url;

    await u.click(screen.getByRole('button', { name: 'Pagadas' }));
    await waitFor(() =>
      expect(last()).toMatch(/status=active.*collection=paid|collection=paid.*status=active/),
    );
    await u.click(screen.getByRole('button', { name: 'Pendientes' }));
    await waitFor(() => expect(last()).toContain('collection=unpaid'));
    await u.click(screen.getByRole('button', { name: 'Canceladas' }));
    await waitFor(() => expect(last()).toContain('status=cancelled'));
    expect(last()).not.toContain('collection');
    expect(screen.getByRole('button', { name: 'Canceladas' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('busca por folio o cliente con una pausa entre teclas', async () => {
    const { calls } = stubApi({ ...base, 'GET /sales': list([paid]) });
    renderApp('/historial');
    await screen.findByText('V-0043');
    await userEvent
      .setup()
      .type(screen.getByRole('searchbox', { name: 'Buscar por folio o cliente' }), 'ana');
    await waitFor(() => expect(calls.some((c) => c.url.includes('q=ana'))).toBe(true));
    expect(calls.filter((c) => c.url.includes('q=')).length).toBe(1);
  });

  it('filtra por fecha de venta con el selector de rango', async () => {
    const { calls } = stubApi({ ...base, 'GET /sales': list([paid]) });
    const u = userEvent.setup();
    renderApp('/historial');
    await screen.findByText('V-0043');
    await u.click(screen.getByRole('button', { name: 'Todas las fechas' }));
    const sheet = await screen.findByRole('dialog', { name: 'Filtrar por fecha de venta' });
    await u.type(within(sheet).getByLabelText('Desde'), '2026-10-01');
    await u.type(within(sheet).getByLabelText('Hasta'), '2026-10-15');
    await u.click(within(sheet).getByRole('button', { name: 'Aplicar filtro' }));
    await waitFor(() =>
      expect(calls.some((c) => c.url.includes('from=2026-10-01&to=2026-10-15'))).toBe(true),
    );
  });

  it('sin ventas invita a registrar la primera; con filtros sin resultados lo explica', async () => {
    stubApi({ ...base, 'GET /sales': list([]) });
    const u = userEvent.setup();
    renderApp('/historial');
    expect(await screen.findByRole('heading', { name: 'Aún no hay ventas' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nueva venta' })).toHaveAttribute('href', '/vender');
    await u.click(screen.getByRole('button', { name: 'Pagadas' }));
    expect(
      await screen.findByRole('heading', { name: 'No encontramos ventas' }),
    ).toBeInTheDocument();
  });

  it('carga más de 50 ventas por partes', async () => {
    const first = Array.from({ length: 50 }, (_, i) =>
      saleSummary({ folio: `V-${String(500 - i).padStart(4, '0')}` }),
    );
    const { calls } = stubApi({
      ...base,
      'GET /sales': () =>
        calls.some((c) => c.url.includes('offset=50'))
          ? list([saleSummary({ folio: 'V-0001' })], 51, 50)
          : list(first, 51, 0),
    });
    const u = userEvent.setup();
    renderApp('/historial');
    await screen.findByText('V-0500');
    await u.click(screen.getByRole('button', { name: 'Cargar más' }));
    expect(await screen.findByText('V-0001')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('si falla la carga ofrece reintentar', async () => {
    let attempts = 0;
    stubApi({
      ...base,
      'GET /sales': () => (++attempts === 1 ? apiError(500, 'internal_error', 'x') : list([paid])),
    });
    renderApp('/historial');
    expect(await screen.findByRole('alert')).toHaveTextContent('req-123');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('V-0043')).toBeInTheDocument();
  });
});
