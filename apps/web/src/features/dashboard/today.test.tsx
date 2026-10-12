import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ME, STORE, apiError, makeDashboard, renderApp, stubApi } from '../../test/helpers';

afterEach(() => vi.unstubAllGlobals());

const base = { 'GET /me': { body: ME }, 'GET /store': { body: STORE } };

describe('Hoy', () => {
  it('muestra ventas, cobrado, lo que falta por cobrar, el desglose y la utilidad bruta', async () => {
    stubApi({ ...base, 'GET /dashboard': { body: makeDashboard() } });
    renderApp('/');
    expect(await screen.findByText('Jueves, 15 de octubre de 2026')).toBeInTheDocument();
    const sales = screen.getByRole('region', { name: 'Ventas del día · 18 ventas' });
    expect(within(sales).getByText('$1,285.00')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Cobrado' })).getByText('$985.00'),
    ).toBeInTheDocument();
    const pending = screen.getByRole('link', { name: /Falta por cobrar/ });
    expect(pending).toHaveTextContent('$300.00');
    expect(pending).toHaveTextContent('3 pendientes');
    expect(pending).toHaveAttribute('href', '/pendientes');
    const methods = screen.getByRole('region', { name: 'Cobrado por método' });
    expect(within(methods).getByText('$640.00')).toBeInTheDocument();
    expect(within(methods).getByText('$345.00')).toBeInTheDocument();
    const profit = screen.getByRole('region', { name: 'Utilidad bruta estimada' });
    expect(within(profit).getByText('$512.00')).toBeInTheDocument();
    // Nunca se presenta como utilidad neta.
    expect(within(profit).getByText(/no es utilidad neta/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nueva venta' })).toHaveAttribute('href', '/vender');
    expect(screen.getByRole('link', { name: 'Perfil' })).toHaveAttribute('href', '/perfil');
  });

  it('un resultado negativo se llama pérdida bruta y se muestra sin signo', async () => {
    stubApi({
      ...base,
      'GET /dashboard': {
        body: makeDashboard({ estimatedGrossProfit: '-10.00', isGrossLoss: true }),
      },
    });
    renderApp('/');
    const profit = await screen.findByRole('region', { name: 'Utilidad bruta estimada' });
    expect(within(profit).getByText('Pérdida bruta estimada')).toBeInTheDocument();
    expect(within(profit).getByText('$10.00')).toBeInTheDocument();
  });

  it('sin ventas ni pendientes lo dice con claridad', async () => {
    stubApi({
      ...base,
      'GET /dashboard': {
        body: makeDashboard({
          salesTotal: '0.00',
          salesCount: 0,
          collected: '0.00',
          collectedByMethod: { cash: '0.00', transfer: '0.00' },
          pendingCount: 0,
          pendingTotal: '0.00',
          estimatedGrossProfit: '0.00',
        }),
      },
    });
    renderApp('/');
    expect(await screen.findByText('Aún no hay ventas hoy.')).toBeInTheDocument();
    expect(screen.getByText('Todo cobrado')).toBeInTheDocument();
  });

  it('avisa si el día no está preparado y ofrece prepararlo', async () => {
    stubApi({ ...base, 'GET /dashboard': { body: makeDashboard({ dayPrepared: false }) } });
    renderApp('/');
    expect(await screen.findByText(/Hoy todavía no preparas el día/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Preparar día' })).toHaveAttribute('href', '/dia');
  });

  it('si falla la carga ofrece reintentar y no deja cifras parciales', async () => {
    let attempts = 0;
    stubApi({
      ...base,
      'GET /dashboard': () =>
        ++attempts === 1 ? apiError(500, 'internal_error', 'x') : { body: makeDashboard() },
    });
    renderApp('/');
    expect(await screen.findByRole('alert')).toHaveTextContent('req-123');
    expect(screen.queryByText('$1,285.00')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('$1,285.00')).toBeInTheDocument();
  });
});
