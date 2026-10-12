import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ME,
  STORE,
  apiError,
  makeOffer,
  makeProduct,
  makeWorkday,
  notPrepared,
  productList,
  renderApp,
  stubApi,
} from '../../test/helpers';

// Jueves 15 de octubre de 2026, 12:00 en la Ciudad de México. Solo se fija la fecha: los temporizadores siguen reales.
beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-15T18:00:00Z') }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const user = () => userEvent.setup();
const base = { 'GET /me': { body: ME }, 'GET /store': { body: STORE } };

describe('preparar día', () => {
  it('un día sin preparar invita a agregar productos', async () => {
    stubApi({ ...base, 'GET /workdays/2026-10-15': notPrepared() });
    renderApp('/dia');
    expect(
      await screen.findByRole('heading', { name: 'Este día todavía no está preparado' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Fecha')).toHaveValue('2026-10-15');
    expect(screen.getByText('Jueves, 15 de octubre de 2026')).toBeInTheDocument();
  });

  it('muestra cada producto con inicial, vendido y disponible', async () => {
    const withAdjustment = makeOffer({
      productName: 'Jugo',
      initialQuantity: '30',
      adjustedQuantity: '10',
      soldQuantity: '12',
      availableQuantity: '28',
    });
    stubApi({
      ...base,
      'GET /workdays/2026-10-15': { body: makeWorkday([makeOffer(), withAdjustment]) },
    });
    renderApp('/dia');
    const card = (await screen.findByText('Tamal de rajas')).closest('li')!;
    expect(within(card).getByText('40')).toBeInTheDocument();
    expect(within(card).getByText('18')).toBeInTheDocument();
    expect(within(card).getByText('22')).toBeInTheDocument();
    // La cantidad inicial incluye los aumentos: 30 + 10.
    const second = screen.getByText('Jugo').closest('li')!;
    expect(within(second).getByText('40')).toBeInTheDocument();
    expect(screen.getByText('Jornada 08:00 a 16:00')).toBeInTheDocument();
  });

  it('avisa si el día no es de operación, sin bloquear', async () => {
    stubApi({
      ...base,
      'GET /workdays/2026-10-17': {
        body: makeWorkday([makeOffer()], {
          date: '2026-10-17',
          isToday: false,
          isOperatingDay: false,
        }),
      },
    });
    renderApp('/dia?fecha=2026-10-17');
    expect(await screen.findByText(/no es de operación/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar producto' })).toBeEnabled();
  });

  it('una fecha pasada se muestra como inventario de solo consulta', async () => {
    stubApi({
      ...base,
      'GET /workdays/2026-10-14': {
        body: makeWorkday([makeOffer()], { date: '2026-10-14', isToday: false, editable: false }),
      },
    });
    renderApp('/dia?fecha=2026-10-14');
    expect(await screen.findByRole('heading', { name: 'Inventario' })).toBeInTheDocument();
    expect(screen.getByText(/solo consulta/)).toBeInTheDocument();
  });

  it('el campo de fecha solo admite de hoy a 60 días adelante', async () => {
    stubApi({ ...base, 'GET /workdays/2026-10-15': notPrepared() });
    renderApp('/dia');
    const date = await screen.findByLabelText('Fecha');
    expect(date).toHaveAttribute('min', '2026-10-15');
    expect(date).toHaveAttribute('max', '2026-12-14');
  });

  it('si falla la carga ofrece reintentar', async () => {
    let attempts = 0;
    stubApi({
      ...base,
      'GET /workdays/2026-10-15': () =>
        ++attempts === 1
          ? apiError(500, 'internal_error', 'x')
          : { body: makeWorkday([makeOffer()]) },
    });
    renderApp('/dia');
    expect(await screen.findByRole('alert')).toHaveTextContent('req-123');
    await user().click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Tamal de rajas')).toBeInTheDocument();
  });

  it('sin conexión deshabilita agregar, aumentar y quitar', async () => {
    stubApi({
      ...base,
      'GET /workdays/2026-10-15': {
        body: makeWorkday([makeOffer({ soldQuantity: '0', availableQuantity: '40' })]),
      },
    });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderApp('/dia');
    await screen.findByText('Tamal de rajas');
    expect(screen.getByRole('button', { name: 'Agregar producto' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Aumentar Tamal/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Quitar Tamal/ })).toBeDisabled();
  });
});

describe('agregar producto al día', () => {
  const tamal = makeProduct({ name: 'Tamal de rajas' });
  const gelatina = makeProduct({ name: 'Gelatina', code: 'GEL-01' });

  it('elige un producto activo que aún no está, pone la cantidad y lo agrega', async () => {
    const taken = makeOffer({ productId: tamal.id });
    const added = makeOffer({
      productId: gelatina.id,
      productName: 'Gelatina',
      initialQuantity: '25',
      soldQuantity: '0',
      availableQuantity: '25',
    });
    let day = makeWorkday([taken]);
    const { calls } = stubApi({
      ...base,
      'GET /workdays/2026-10-15': () => ({ body: day }),
      'GET /products': productList([tamal, gelatina]),
      'POST /workdays/2026-10-15/offers': () => {
        day = makeWorkday([taken, added]);
        return { status: 201, body: day };
      },
    });
    const u = user();
    renderApp('/dia');
    await u.click(await screen.findByRole('button', { name: 'Agregar producto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Agregar producto' });
    // El que ya está en el día no se ofrece otra vez.
    expect(
      within(dialog).queryByRole('button', { name: /Tamal de rajas/ }),
    ).not.toBeInTheDocument();
    await u.click(await within(dialog).findByRole('button', { name: /Gelatina/ }));
    await u.type(within(dialog).getByLabelText('Cantidad inicial'), '25');
    await u.click(within(dialog).getByRole('button', { name: 'Agregar al día' }));
    expect(await screen.findByText('Producto agregado al día.')).toBeInTheDocument();
    expect(calls.find((c) => c.key.startsWith('POST /workdays'))!.body).toEqual({
      productId: gelatina.id,
      quantity: '25',
    });
    expect(await screen.findByText('Gelatina')).toBeInTheDocument();
  });

  it('pide una cantidad válida y no llama al servidor', async () => {
    const { calls } = stubApi({
      ...base,
      'GET /workdays/2026-10-15': notPrepared(),
      'GET /products': productList([gelatina]),
    });
    const u = user();
    renderApp('/dia');
    await u.click(await screen.findByRole('button', { name: 'Agregar producto' }));
    const dialog = await screen.findByRole('dialog');
    await u.click(await within(dialog).findByRole('button', { name: /Gelatina/ }));
    await u.type(within(dialog).getByLabelText('Cantidad inicial'), '-3');
    await u.click(within(dialog).getByRole('button', { name: 'Agregar al día' }));
    expect(within(dialog).getByLabelText('Cantidad inicial')).toHaveAccessibleDescription(
      'No puede ser negativa.',
    );
    expect(calls.some((c) => c.key.startsWith('POST'))).toBe(false);
  });

  it('los botones − y + cambian la cantidad con aritmética exacta', async () => {
    stubApi({
      ...base,
      'GET /workdays/2026-10-15': notPrepared(),
      'GET /products': productList([gelatina]),
    });
    const u = user();
    renderApp('/dia');
    await u.click(await screen.findByRole('button', { name: 'Agregar producto' }));
    const dialog = await screen.findByRole('dialog');
    await u.click(await within(dialog).findByRole('button', { name: /Gelatina/ }));
    const quantity = within(dialog).getByLabelText('Cantidad inicial');
    await u.type(quantity, '9');
    await u.click(within(dialog).getByRole('button', { name: /Aumentar cantidad inicial/ }));
    expect(quantity).toHaveValue('10');
    await u.click(within(dialog).getByRole('button', { name: /Disminuir cantidad inicial/ }));
    await u.click(within(dialog).getByRole('button', { name: /Disminuir cantidad inicial/ }));
    expect(quantity).toHaveValue('8');
  });

  it('sin productos disponibles lo explica', async () => {
    stubApi({
      ...base,
      'GET /workdays/2026-10-15': notPrepared(),
      'GET /products': productList([]),
    });
    renderApp('/dia');
    await user().click(await screen.findByRole('button', { name: 'Agregar producto' }));
    expect(await screen.findByText('No hay productos para agregar')).toBeInTheDocument();
  });
});

describe('aumentar la cantidad', () => {
  const offer = makeOffer();
  const routes = () => ({ ...base, 'GET /workdays/2026-10-15': { body: makeWorkday([offer]) } });

  it('muestra lo actual, pide motivo y envía solo el aumento', async () => {
    const increased = makeOffer({ ...offer, adjustedQuantity: '10', availableQuantity: '32' });
    const { calls } = stubApi({
      ...routes(),
      [`POST /workdays/2026-10-15/offers/${offer.id}/adjustments`]: {
        status: 201,
        body: makeWorkday([increased]),
      },
    });
    const u = user();
    renderApp('/dia');
    await u.click(await screen.findByRole('button', { name: /Aumentar Tamal/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Aumentar cantidad' });
    expect(within(dialog).getByLabelText('Nueva cantidad')).toHaveValue('40');
    expect(within(dialog).getByText('Mínimo 40. Solo se puede aumentar.')).toBeInTheDocument();
    const quantity = within(dialog).getByLabelText('Nueva cantidad');
    await u.clear(quantity);
    await u.type(quantity, '50');
    expect(
      within(dialog).getByRole('button', { name: 'Guardar aumento · +10' }),
    ).toBeInTheDocument();
    await u.type(within(dialog).getByLabelText('Motivo *'), 'Se preparó más producto');
    await u.click(within(dialog).getByRole('button', { name: 'Guardar aumento · +10' }));
    expect(await screen.findByText('Cantidad aumentada.')).toBeInTheDocument();
    expect(calls.find((c) => c.key.includes('adjustments'))!.body).toEqual({
      increment: '10',
      reason: 'Se preparó más producto',
    });
  });

  it('no deja bajar ni dejar igual la cantidad, y exige el motivo', async () => {
    const { calls } = stubApi(routes());
    const u = user();
    renderApp('/dia');
    await u.click(await screen.findByRole('button', { name: /Aumentar Tamal/ }));
    const dialog = await screen.findByRole('dialog');
    const quantity = within(dialog).getByLabelText('Nueva cantidad');
    await u.clear(quantity);
    await u.type(quantity, '35');
    await u.click(within(dialog).getByRole('button', { name: 'Aumentar' }));
    expect(quantity).toHaveAccessibleDescription(/Escribe una cantidad mayor que la actual/);
    await u.clear(quantity);
    await u.type(quantity, '41');
    await u.click(within(dialog).getByRole('button', { name: /Guardar aumento/ }));
    expect(within(dialog).getByLabelText('Motivo *')).toHaveAccessibleDescription(
      'Escribe el motivo del aumento.',
    );
    expect(calls.some((c) => c.key.includes('adjustments'))).toBe(false);
  });

  it('un producto en piezas no admite fracciones', async () => {
    stubApi(routes());
    const u = user();
    renderApp('/dia');
    await u.click(await screen.findByRole('button', { name: /Aumentar Tamal/ }));
    const dialog = await screen.findByRole('dialog');
    const quantity = within(dialog).getByLabelText('Nueva cantidad');
    await u.clear(quantity);
    await u.type(quantity, '40.5');
    await u.type(within(dialog).getByLabelText('Motivo *'), 'x');
    await u.click(within(dialog).getByRole('button', { name: /Guardar aumento/ }));
    expect(quantity).toHaveAccessibleDescription(/piezas enteras/);
  });

  it('Cancelar cierra sin enviar nada', async () => {
    const { calls } = stubApi(routes());
    const u = user();
    renderApp('/dia');
    await u.click(await screen.findByRole('button', { name: /Aumentar Tamal/ }));
    await u.click(await screen.findByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.some((c) => c.key.includes('adjustments'))).toBe(false);
  });
});

describe('quitar un producto del día', () => {
  it('sin ventas pide confirmar, con salida segura primero, y lo quita', async () => {
    const offer = makeOffer({
      soldQuantity: '0',
      availableQuantity: '40',
      productName: 'Gelatina',
    });
    const { calls } = stubApi({
      ...base,
      'GET /workdays/2026-10-15': { body: makeWorkday([offer]) },
      [`DELETE /workdays/2026-10-15/offers/${offer.id}`]: { body: makeWorkday([]) },
    });
    const u = user();
    renderApp('/dia');
    await u.click(await screen.findByRole('button', { name: /Quitar Gelatina/ }));
    const dialog = await screen.findByRole('alertdialog', { name: '¿Quitar Gelatina del día?' });
    expect(within(dialog).getByRole('button', { name: 'Volver' })).toHaveFocus();
    await u.click(within(dialog).getByRole('button', { name: 'Quitar del día' }));
    expect(await screen.findByText('Producto quitado del día.')).toBeInTheDocument();
    expect(calls.some((c) => c.key.startsWith('DELETE'))).toBe(true);
  });

  it('con ventas explica por qué no se puede, sin llamar al servidor', async () => {
    const { calls } = stubApi({
      ...base,
      'GET /workdays/2026-10-15': { body: makeWorkday([makeOffer()]) },
    });
    const u = user();
    renderApp('/dia');
    await u.click(await screen.findByRole('button', { name: 'Con ventas: no se puede quitar.' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'No se puede quitar' });
    expect(dialog).toHaveTextContent('Tamal de rajas ya tiene 18 vendidas');
    await u.click(within(dialog).getByRole('button', { name: 'Entendido' }));
    expect(calls.some((c) => c.key.startsWith('DELETE'))).toBe(false);
  });

  it('si el servidor dice que ya tiene ventas (aunque estén canceladas), lo explica', async () => {
    const offer = makeOffer({ soldQuantity: '0', availableQuantity: '40' });
    stubApi({
      ...base,
      'GET /workdays/2026-10-15': { body: makeWorkday([offer]) },
      [`DELETE /workdays/2026-10-15/offers/${offer.id}`]: apiError(
        409,
        'conflict',
        'Este producto ya tiene ventas en el día y no se puede quitar.',
      ),
    });
    const u = user();
    renderApp('/dia');
    await u.click(await screen.findByRole('button', { name: /Quitar Tamal/ }));
    await u.click(await screen.findByRole('button', { name: 'Quitar del día' }));
    expect(
      await screen.findByRole('alertdialog', { name: 'No se puede quitar' }),
    ).toBeInTheDocument();
  });
});
