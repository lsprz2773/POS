import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ME,
  STORE,
  apiError,
  makeOffer,
  makeWorkday,
  notPrepared,
  renderApp,
  stubApi,
} from '../../test/helpers';

const NOON = new Date('2026-10-15T18:00:00Z'); // 12:00 en la Ciudad de México
beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: NOON }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const base = { 'GET /me': { body: ME }, 'GET /store': { body: STORE } };

const level = (name: string) => screen.getByText(name).closest('li')!;

describe('inventario del día', () => {
  const day = makeWorkday([
    makeOffer({
      productName: 'Tamal de rajas',
      initialQuantity: '40',
      soldQuantity: '18',
      availableQuantity: '22',
    }),
    makeOffer({
      productName: 'Empanada de piña',
      initialQuantity: '24',
      soldQuantity: '20',
      availableQuantity: '4',
    }),
    makeOffer({
      productName: 'Sándwich de jamón',
      initialQuantity: '20',
      soldQuantity: '20',
      availableQuantity: '0',
    }),
    makeOffer({
      productName: 'Gelatina',
      initialQuantity: '15',
      adjustedQuantity: '10',
      soldQuantity: '0',
      availableQuantity: '25',
    }),
  ]);

  it('suma lo vendido y lo disponible y marca cada producto con texto', async () => {
    stubApi({ ...base, 'GET /workdays/2026-10-15': { body: day } });
    renderApp('/dia/inventario');
    expect(await screen.findByText('Tamal de rajas')).toBeInTheDocument();
    expect(screen.getByText('Vendidas').nextElementSibling).toHaveTextContent('58');
    expect(screen.getByText('Disponibles').nextElementSibling).toHaveTextContent('51');
    expect(within(level('Tamal de rajas')).getByText('Disponible')).toBeInTheDocument();
    expect(within(level('Empanada de piña')).getByText('Quedan pocas')).toBeInTheDocument();
    expect(within(level('Sándwich de jamón')).getByText('Agotado')).toBeInTheDocument();
    expect(within(level('Gelatina')).getByText('Inicial 25')).toBeInTheDocument();
    expect(within(level('Tamal de rajas')).getByText('Quedan 22')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '45 % vendido' })).toBeInTheDocument();
  });

  it('es de solo consulta y enlaza a preparar el día', async () => {
    stubApi({ ...base, 'GET /workdays/2026-10-15': { body: day } });
    renderApp('/dia/inventario');
    await screen.findByText('Tamal de rajas');
    expect(screen.getByText(/solo consulta/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Preparar' })).toHaveAttribute('href', '/dia');
    expect(screen.queryByRole('button', { name: /Aumentar|Quitar/ })).not.toBeInTheDocument();
  });

  it('en horario no avisa; fuera de horario avisa sin bloquear', async () => {
    stubApi({ ...base, 'GET /workdays/2026-10-15': { body: day } });
    renderApp('/dia/inventario');
    await screen.findByText('Tamal de rajas');
    expect(screen.queryByText(/Puedes seguir vendiendo/)).not.toBeInTheDocument();
  });

  it('a las 16:40 avisa que la jornada ya terminó y que se puede seguir vendiendo', async () => {
    vi.setSystemTime(new Date('2026-10-15T22:40:00Z')); // 16:40 en la Ciudad de México
    stubApi({ ...base, 'GET /workdays/2026-10-15': { body: day } });
    renderApp('/dia/inventario');
    expect(
      await screen.findByText(
        'Son las 16:40 y la jornada es de 08:00 a 16:00. Puedes seguir vendiendo.',
      ),
    ).toBeInTheDocument();
  });

  it('una jornada anterior se abre por fecha, sin enlace para editarla', async () => {
    stubApi({
      ...base,
      'GET /workdays/2026-10-14': {
        body: makeWorkday(day.offers, { date: '2026-10-14', isToday: false, editable: false }),
      },
    });
    renderApp('/dia/inventario?fecha=2026-10-14');
    expect(
      await screen.findByText('Miércoles, 14 de octubre de 2026 · solo consulta'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Preparar' })).not.toBeInTheDocument();
    // Una jornada pasada nunca avisa de horario.
    expect(screen.queryByText(/Puedes seguir vendiendo/)).not.toBeInTheDocument();
  });

  it('un día sin preparar o sin productos lo explica', async () => {
    stubApi({ ...base, 'GET /workdays/2026-10-15': notPrepared() });
    renderApp('/dia/inventario');
    expect(
      await screen.findByRole('heading', { name: 'Este día no tiene productos' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Preparar' })).toBeInTheDocument();
  });

  it('si falla la carga ofrece reintentar', async () => {
    let attempts = 0;
    stubApi({
      ...base,
      'GET /workdays/2026-10-15': () =>
        ++attempts === 1 ? apiError(500, 'internal_error', 'x') : { body: day },
    });
    renderApp('/dia/inventario');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Tamal de rajas')).toBeInTheDocument();
  });
});

const summary = (date: string, products: number, sold: string) => ({
  id: `4${date.replaceAll('-', '').slice(-7)}-0000-4000-8000-000000000000`.slice(0, 36),
  date,
  startTime: '08:00',
  endTime: '16:00',
  products,
  initialQuantity: '100',
  adjustedQuantity: '0',
  soldQuantity: sold,
  availableQuantity: '10',
});

describe('jornadas anteriores', () => {
  it('lista los días terminados, el más reciente primero, y abre cada uno como inventario', async () => {
    const { calls } = stubApi({
      ...base,
      'GET /workdays': {
        body: {
          items: [summary('2026-10-14', 5, '71'), summary('2026-10-13', 1, '64')],
          total: 2,
          limit: 30,
          offset: 0,
        },
      },
    });
    renderApp('/dia/anteriores');
    expect(
      await screen.findByText('Son días terminados: solo se pueden consultar.'),
    ).toBeInTheDocument();
    const first = await screen.findByRole('link', { name: /Miércoles, 14 de octubre de 2026/ });
    expect(first).toHaveTextContent('5 productos · 71 vendidas');
    expect(first).toHaveAttribute('href', '/dia/inventario?fecha=2026-10-14');
    expect(screen.getByRole('link', { name: /Martes, 13 de octubre/ })).toHaveTextContent(
      '1 producto · 64 vendidas',
    );
    // Hoy no es una jornada anterior: se pide hasta ayer (el filtro `to` es inclusivo).
    expect(calls.find((c) => c.key === 'GET /workdays')!.url).toContain('to=2026-10-14');
  });

  it('carga más días por partes', async () => {
    const page = (n: number, offset: number) =>
      Array.from({ length: n }, (_, i) =>
        summary(`2026-09-${String(30 - offset - i).padStart(2, '0')}`, 3, '10'),
      );
    const { calls } = stubApi({
      ...base,
      'GET /workdays': () =>
        calls.some((c) => c.url.includes('offset=30'))
          ? {
              body: {
                items: page(1, 30).map((d) => ({ ...d, date: '2026-08-31' })),
                total: 31,
                limit: 30,
                offset: 30,
              },
            }
          : { body: { items: page(30, 0), total: 31, limit: 30, offset: 0 } },
    });
    renderApp('/dia/anteriores');
    await screen.findByRole('link', { name: /30 de septiembre/ });
    await userEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    expect(await screen.findByRole('link', { name: /31 de agosto/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('sin jornadas anteriores lo explica', async () => {
    stubApi({ ...base, 'GET /workdays': { body: { items: [], total: 0, limit: 30, offset: 0 } } });
    renderApp('/dia/anteriores');
    expect(
      await screen.findByRole('heading', { name: 'Aún no hay jornadas anteriores' }),
    ).toBeInTheDocument();
  });

  it('si falla la carga ofrece reintentar', async () => {
    stubApi({ ...base, 'GET /workdays': apiError(500, 'internal_error', 'x') });
    renderApp('/dia/anteriores');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
