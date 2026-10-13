import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ME, STORE, apiError, makeReport, renderApp, stubApi } from '../../test/helpers';

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-15T18:00:00Z') }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const base = { 'GET /me': { body: ME }, 'GET /store': { body: STORE } };
const region = (name: string) => screen.getByRole('region', { name });

describe('reportes', () => {
  it('abre la semana actual con todas las cifras del periodo', async () => {
    const { calls } = stubApi({ ...base, 'GET /reports': { body: makeReport() } });
    renderApp('/reportes');
    expect(await screen.findByText('Ventas · 66 ventas')).toBeInTheDocument();
    expect(calls.find((c) => c.key === 'GET /reports')!.url).toBe(
      '/reports?period=week&date=2026-10-12',
    );
    expect(screen.getByText('12 oct 2026 a 18 oct 2026')).toBeInTheDocument();
    expect(within(region('Ventas · 66 ventas')).getByText('$4,892.00')).toBeInTheDocument();
    expect(screen.getByText('263 unidades · ticket promedio $74.12')).toBeInTheDocument();
    expect(within(region('Cobrado')).getByText('$4,592.00')).toBeInTheDocument();
    expect(within(region('Cobrado')).getByText('Por fecha de pago')).toBeInTheDocument();
    expect(within(region('Pendiente del periodo')).getByText('$300.00')).toBeInTheDocument();
    const methods = region('Cobrado por método');
    expect(within(methods).getByText(/\$2,980\.00/)).toHaveTextContent('65 %');
    expect(within(methods).getByText(/\$1,612\.00/)).toHaveTextContent('35 %');
    const gross = region('Utilidad bruta');
    expect(within(gross).getByText('− $2,963.00')).toBeInTheDocument();
    expect(within(gross).getByText('$1,929.00')).toBeInTheDocument();
    expect(within(gross).getByText('39.43 %')).toBeInTheDocument();
    expect(
      within(gross).getByText('No incluye gastos ni impuestos: no es utilidad neta.'),
    ).toBeInTheDocument();
    const top = region('Productos más vendidos');
    expect(within(top).getByText('1. Tamal de rajas')).toBeInTheDocument();
    expect(within(top).getByText('98 pzas')).toBeInTheDocument();
    const cancelled = region('Ventas canceladas');
    expect(within(cancelled).getByText('2 ventas · $108.00')).toBeInTheDocument();
    expect(
      within(cancelled).getByText(/Por devolver fuera del sistema: \$54\.00/),
    ).toBeInTheDocument();
  });

  it('cambia de periodo: día, mes y navegación al anterior y siguiente', async () => {
    const { calls } = stubApi({ ...base, 'GET /reports': { body: makeReport() } });
    const u = userEvent.setup();
    renderApp('/reportes');
    await screen.findByText('Ventas · 66 ventas');
    const last = () => calls.filter((c) => c.key === 'GET /reports').at(-1)!.url;

    await u.click(screen.getByRole('button', { name: 'Día' }));
    // De Semana a Día se muestra hoy (jueves 15), no el lunes de la semana.
    await waitFor(() => expect(last()).toBe('/reports?period=day&date=2026-10-15'));
    await u.click(screen.getByRole('button', { name: 'Mes' }));
    await waitFor(() => expect(last()).toBe('/reports?period=month&date=2026-10-01'));
    expect(screen.getByText('Octubre de 2026')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Periodo anterior' }));
    await waitFor(() => expect(last()).toBe('/reports?period=month&date=2026-09-01'));
    expect(screen.getByText('Septiembre de 2026')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Periodo siguiente' }));
    await waitFor(() => expect(last()).toBe('/reports?period=month&date=2026-10-01'));
  });

  it('no deja avanzar a un periodo que incluye el futuro', async () => {
    stubApi({ ...base, 'GET /reports': { body: makeReport() } });
    renderApp('/reportes');
    await screen.findByText('Ventas · 66 ventas');
    // La semana actual termina el 18, después de hoy (15): no hay siguiente.
    expect(screen.getByRole('button', { name: 'Periodo siguiente' })).toBeDisabled();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Periodo anterior' }));
    expect(screen.getByRole('button', { name: 'Periodo siguiente' })).toBeEnabled();
  });

  it('rango personalizado: pide las dos fechas, valida y consulta', async () => {
    const { calls } = stubApi({
      ...base,
      'GET /reports': { body: makeReport({ from: '2026-10-01', to: '2026-10-05' }) },
    });
    const u = userEvent.setup();
    renderApp('/reportes');
    await screen.findByText('Ventas · 66 ventas');
    await u.click(screen.getByRole('button', { name: 'Rango' }));
    await u.click(screen.getByRole('button', { name: 'Aplicar rango' }));
    expect(screen.getByLabelText('Hasta')).toHaveAccessibleDescription('Elige las dos fechas.');
    await u.type(screen.getByLabelText('Desde'), '2026-10-05');
    await u.type(screen.getByLabelText('Hasta'), '2026-10-01');
    await u.click(screen.getByRole('button', { name: 'Aplicar rango' }));
    expect(screen.getByLabelText('Hasta')).toHaveAccessibleDescription(
      'La fecha final no puede ser anterior a la inicial.',
    );
    await u.clear(screen.getByLabelText('Desde'));
    await u.type(screen.getByLabelText('Desde'), '2026-10-01');
    await u.clear(screen.getByLabelText('Hasta'));
    await u.type(screen.getByLabelText('Hasta'), '2026-10-05');
    await u.click(screen.getByRole('button', { name: 'Aplicar rango' }));
    await waitFor(() =>
      expect(calls.some((c) => c.url === '/reports?from=2026-10-01&to=2026-10-05')).toBe(true),
    );
  });

  it('un rango de más de un año se rechaza antes de consultar', async () => {
    const { calls } = stubApi({ ...base, 'GET /reports': { body: makeReport() } });
    const u = userEvent.setup();
    renderApp('/reportes');
    await screen.findByText('Ventas · 66 ventas');
    await u.click(screen.getByRole('button', { name: 'Rango' }));
    await u.type(screen.getByLabelText('Desde'), '2025-01-01');
    await u.type(screen.getByLabelText('Hasta'), '2026-10-01');
    await u.click(screen.getByRole('button', { name: 'Aplicar rango' }));
    expect(screen.getByLabelText('Hasta')).toHaveAccessibleDescription(
      'El rango no puede pasar de 366 días.',
    );
    expect(calls.some((c) => c.url.includes('from=2025'))).toBe(false);
  });

  it('un periodo sin ventas muestra ceros y lo explica', async () => {
    stubApi({
      ...base,
      'GET /reports': {
        body: makeReport({
          salesTotal: '0.00',
          salesCount: 0,
          averageTicket: '0.00',
          unitsSold: '0',
          collected: '0.00',
          collectedByMethod: { cash: '0.00', transfer: '0.00' },
          pending: '0.00',
          costOfGoodsSold: '0.00',
          grossProfit: '0.00',
          grossMargin: null,
          topProducts: [],
          cancelled: { count: 0, total: '0.00', refundDue: '0.00' },
        }),
      },
    });
    renderApp('/reportes');
    expect(await screen.findByText('No hay ventas en este periodo.')).toBeInTheDocument();
    expect(screen.getByText('Sin ventas en este periodo.')).toBeInTheDocument();
    expect(screen.queryByText(/Margen bruto/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Por devolver fuera del sistema/)).not.toBeInTheDocument();
  });

  it('un resultado negativo se muestra como pérdida bruta, nunca como utilidad', async () => {
    stubApi({
      ...base,
      'GET /reports': {
        body: makeReport({
          salesTotal: '20.00',
          costOfGoodsSold: '30.00',
          grossProfit: '-10.00',
          isGrossLoss: true,
          grossMargin: '-50.00',
        }),
      },
    });
    renderApp('/reportes');
    const gross = await screen.findByRole('region', { name: 'Utilidad bruta' });
    expect(within(gross).getAllByText('Pérdida bruta')).toHaveLength(2);
    expect(within(gross).getByText('$10.00')).toBeInTheDocument();
    expect(within(gross).getByText('− 50.00 %')).toBeInTheDocument();
    expect(within(gross).queryByText('Utilidad bruta')).not.toBeInTheDocument();
  });

  it('si falla la carga ofrece reintentar', async () => {
    let attempts = 0;
    stubApi({
      ...base,
      'GET /reports': () =>
        ++attempts === 1 ? apiError(500, 'internal_error', 'x') : { body: makeReport() },
    });
    renderApp('/reportes');
    expect(await screen.findByRole('alert')).toHaveTextContent('req-123');
    expect(screen.queryByText('$4,892.00')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Ventas · 66 ventas')).toBeInTheDocument();
  });
});
