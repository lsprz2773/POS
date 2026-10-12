import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ME,
  STORE,
  apiError,
  makeOffer,
  makePayment,
  makeSale,
  makeWorkday,
  notPrepared,
  renderApp,
  stubApi,
} from '../../test/helpers';

// Jueves 15 de octubre de 2026, 12:00 en la Ciudad de México.
beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-15T18:00:00Z') }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const user = () => userEvent.setup();
const base = { 'GET /me': { body: ME }, 'GET /store': { body: STORE } };

const tamal = makeOffer({ productName: 'Tamal de rajas', price: '25.00', availableQuantity: '22' });
const jugo = makeOffer({ productName: 'Jugo de naranja', price: '18.00', availableQuantity: '18' });
const agotado = makeOffer({
  productName: 'Sándwich de jamón',
  price: '35.00',
  availableQuantity: '0',
  soldQuantity: '20',
});
const day = () => ({ 'GET /workdays/2026-10-15': { body: makeWorkday([tamal, jugo, agotado]) } });

const add = (name: string) => screen.getByRole('button', { name: `Agregar ${name}` });

async function toStep2(u: ReturnType<typeof user>) {
  await u.click(await screen.findByRole('button', { name: 'Agregar Tamal de rajas' }));
  await u.click(screen.getByRole('button', { name: 'Agregar una pieza de Tamal de rajas' }));
  await u.click(add('Jugo de naranja'));
  await u.click(screen.getByRole('button', { name: 'Continuar' }));
}

describe('nueva venta: paso 1, productos', () => {
  it('lista los productos de hoy con precio y existencias, y marca el agotado', async () => {
    stubApi({ ...base, ...day() });
    renderApp('/vender');
    expect(await screen.findByText('Tamal de rajas')).toBeInTheDocument();
    expect(screen.getByText('$25.00 · quedan 22')).toBeInTheDocument();
    expect(screen.getByText('$18.00 · quedan 18')).toBeInTheDocument();
    expect(screen.getByText('Agotado')).toBeInTheDocument();
    expect(screen.getByText('Paso 1 de 2 · Productos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
    expect(screen.getByText('Agrega al menos un producto para continuar.')).toBeInTheDocument();
  });

  it('suma piezas y total mientras se agregan productos', async () => {
    stubApi({ ...base, ...day() });
    const u = user();
    renderApp('/vender');
    await u.click(await screen.findByRole('button', { name: 'Agregar Tamal de rajas' }));
    expect(screen.getByText('1 pieza · 1 producto')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Agregar una pieza de Tamal de rajas' }));
    await u.click(add('Jugo de naranja'));
    expect(screen.getByText('3 piezas · 2 productos')).toBeInTheDocument();
    expect(screen.getByText('$68.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled();
  });

  it('no deja pasar de lo disponible, ni escribiendo', async () => {
    stubApi({ ...base, ...day() });
    const u = user();
    renderApp('/vender');
    await u.click(await screen.findByRole('button', { name: 'Agregar Jugo de naranja' }));
    const quantity = screen.getByRole('textbox', { name: 'Cantidad de Jugo de naranja' });
    await u.clear(quantity);
    await u.type(quantity, '99');
    await u.tab();
    expect(quantity).toHaveValue('18');
    expect(screen.getByText('$324.00')).toBeInTheDocument();
  });

  it('quitar la última pieza saca el producto del borrador', async () => {
    stubApi({ ...base, ...day() });
    const u = user();
    renderApp('/vender');
    await u.click(await screen.findByRole('button', { name: 'Agregar Tamal de rajas' }));
    await u.click(screen.getByRole('button', { name: 'Quitar una pieza de Tamal de rajas' }));
    expect(screen.getByRole('button', { name: 'Agregar Tamal de rajas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
  });

  it('filtra por nombre', async () => {
    stubApi({ ...base, ...day() });
    const u = user();
    renderApp('/vender');
    await u.type(await screen.findByRole('searchbox', { name: 'Buscar producto' }), 'jugo');
    expect(screen.queryByText('Tamal de rajas')).not.toBeInTheDocument();
    expect(screen.getByText('Jugo de naranja')).toBeInTheDocument();
  });

  it('sin jornada preparada manda a Preparar día', async () => {
    stubApi({ ...base, 'GET /workdays/2026-10-15': notPrepared() });
    renderApp('/vender');
    expect(
      await screen.findByRole('heading', { name: 'Prepara el día antes de vender' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Preparar día' })).toHaveAttribute('href', '/dia');
  });

  it('si todo está agotado lo explica', async () => {
    stubApi({ ...base, 'GET /workdays/2026-10-15': { body: makeWorkday([agotado]) } });
    renderApp('/vender');
    expect(
      await screen.findByRole('heading', { name: 'No hay productos para vender' }),
    ).toBeInTheDocument();
  });

  it('si falla la carga ofrece reintentar', async () => {
    let attempts = 0;
    stubApi({
      ...base,
      'GET /workdays/2026-10-15': () =>
        ++attempts === 1 ? apiError(500, 'internal_error', 'x') : { body: makeWorkday([tamal]) },
    });
    renderApp('/vender');
    expect(await screen.findByRole('alert')).toHaveTextContent('req-123');
    await user().click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Tamal de rajas')).toBeInTheDocument();
  });

  it('con productos en el borrador pregunta antes de salir', async () => {
    stubApi({ ...base, ...day() });
    const u = user();
    renderApp('/vender');
    await u.click(await screen.findByRole('button', { name: 'Agregar Tamal de rajas' }));
    await u.click(screen.getByRole('link', { name: 'Salir de la venta' }));
    expect(
      await screen.findByRole('alertdialog', { name: '¿Salir sin guardar?' }),
    ).toBeInTheDocument();
  });
});

describe('nueva venta: paso 2, cobro', () => {
  it('resume la venta y propone cobrar todo en efectivo', async () => {
    stubApi({ ...base, ...day() });
    const u = user();
    renderApp('/vender');
    await toStep2(u);
    expect(screen.getByText('Paso 2 de 2 · Cobro')).toBeInTheDocument();
    const summary = screen.getByRole('region', { name: 'Productos' });
    expect(within(summary).getByText('$50.00')).toBeInTheDocument();
    expect(within(summary).getByText('$18.00')).toBeInTheDocument();
    expect(within(summary).getByText('$68.00')).toBeInTheDocument();
    expect(screen.getByText('Efectivo')).toBeInTheDocument();
    expect(screen.getByText(/Recibido \$68\.00/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar venta · $68.00' })).toBeEnabled();
  });

  it('avisa fuera de horario sin bloquear', async () => {
    vi.setSystemTime(new Date('2026-10-15T22:40:00Z')); // 16:40
    stubApi({ ...base, ...day() });
    const u = user();
    renderApp('/vender');
    await toStep2(u);
    expect(
      screen.getByText(
        'Fuera del horario de la jornada (08:00 a 16:00). Puedes registrar la venta.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirmar venta/ })).toBeEnabled();
  });

  it('confirma con pago en efectivo y llave de idempotencia, y muestra la venta registrada', async () => {
    const sale = makeSale({
      folio: 'V-0043',
      total: '68.00',
      paid: '68.00',
      balance: '0.00',
      paymentStatus: 'paid',
      payments: [makePayment({ amount: '68.00' })],
    });
    const { calls, fetchMock } = stubApi({
      ...base,
      ...day(),
      'POST /sales': { status: 201, body: sale },
      [`GET /sales/${sale.id}`]: { body: sale },
    });
    const u = user();
    renderApp('/vender');
    await toStep2(u);
    await u.type(screen.getByLabelText('Cliente o referencia (opcional)'), 'Mtra. Ana');
    await u.click(screen.getByRole('button', { name: 'Confirmar venta · $68.00' }));
    expect(await screen.findByRole('heading', { name: 'Venta registrada' })).toBeInTheDocument();
    const post = calls.find((c) => c.key === 'POST /sales')!;
    expect(post.body).toEqual({
      items: [
        { productId: tamal.productId, quantity: '2' },
        { productId: jugo.productId, quantity: '1' },
      ],
      customerReference: 'Mtra. Ana',
      payments: [{ method: 'cash', amount: '68.00' }],
    });
    // Ni precio, ni total, ni tienda: eso lo decide el servidor.
    expect(Object.keys(post.body as object)).not.toContain('total');
    const headers = (
      fetchMock.mock.calls.find(([url]) => String(url) === '/api/sales')![1] as RequestInit
    ).headers as Record<string, string>;
    expect(headers['idempotency-key']).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
    expect(screen.getByText('V-0043')).toBeInTheDocument();
    expect(screen.getByText('Pagada')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver detalle' })).toHaveAttribute(
      'href',
      `/ventas/${sale.id}`,
    );
  });

  it('dejar pendiente envía la venta sin pagos', async () => {
    const sale = makeSale({ total: '68.00', balance: '68.00' });
    const { calls } = stubApi({
      ...base,
      ...day(),
      'POST /sales': { status: 201, body: sale },
      [`GET /sales/${sale.id}`]: { body: sale },
    });
    const u = user();
    renderApp('/vender');
    await toStep2(u);
    await u.click(screen.getByRole('button', { name: 'Dejar pendiente' }));
    expect(screen.getByText(/La venta quedará pendiente por el total/)).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: /Confirmar venta/ }));
    expect(await screen.findByRole('heading', { name: 'Venta registrada' })).toBeInTheDocument();
    expect(calls.find((c) => c.key === 'POST /sales')!.body).not.toHaveProperty('payments');
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
  });

  it('permite cobrar un mixto y parcial desde la hoja de cobro', async () => {
    const sale = makeSale({
      total: '68.00',
      paid: '50.00',
      balance: '18.00',
      paymentStatus: 'partial',
    });
    const { calls } = stubApi({
      ...base,
      ...day(),
      'POST /sales': { status: 201, body: sale },
      [`GET /sales/${sale.id}`]: { body: sale },
    });
    const u = user();
    renderApp('/vender');
    await toStep2(u);
    await u.click(screen.getByRole('button', { name: 'Cambiar método o importes' }));
    const sheet = await screen.findByRole('dialog', { name: 'Cobro' });
    await u.click(within(sheet).getByRole('button', { name: 'Mixto' }));
    const cash = within(sheet).getByLabelText('Efectivo');
    await u.clear(cash);
    await u.type(cash, '30');
    await u.type(within(sheet).getByLabelText('Transferencia'), '20');
    expect(within(sheet).getByText('Suma $50.00. Faltarán $18.00 por pagar.')).toBeInTheDocument();
    await u.click(within(sheet).getByRole('button', { name: 'Usar este cobro · $50.00' }));
    expect(screen.getByText(/Recibido \$50\.00/)).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: /Confirmar venta/ }));
    await screen.findByRole('heading', { name: 'Venta registrada' });
    expect(calls.find((c) => c.key === 'POST /sales')!.body).toMatchObject({
      payments: [
        { method: 'cash', amount: '30.00' },
        { method: 'transfer', amount: '20.00' },
      ],
    });
  });

  it('la hoja de cobro no deja cobrar más que el total', async () => {
    stubApi({ ...base, ...day() });
    const u = user();
    renderApp('/vender');
    await toStep2(u);
    await u.click(screen.getByRole('button', { name: 'Cambiar método o importes' }));
    const sheet = await screen.findByRole('dialog', { name: 'Cobro' });
    const cash = within(sheet).getByLabelText('Efectivo');
    await u.clear(cash);
    await u.type(cash, '70');
    await u.click(within(sheet).getByRole('button', { name: /Usar este cobro/ }));
    expect(within(sheet).getByText('No puedes cobrar más de $68.00.')).toBeInTheDocument();
  });

  it('si no alcanza el inventario, no registra, explica y regresa a los productos', async () => {
    stubApi({
      ...base,
      ...day(),
      'POST /sales': {
        status: 409,
        body: {
          code: 'insufficient_stock',
          error: 'No hay inventario suficiente para completar la venta.',
          fields: { 'items.0.quantity': 'Solo quedan 1 de Tamal de rajas.' },
        },
      },
    });
    const u = user();
    renderApp('/vender');
    await toStep2(u);
    await u.click(screen.getByRole('button', { name: /Confirmar venta/ }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se registró la venta.');
    expect(alert).toHaveTextContent('Solo quedan 1 de Tamal de rajas.');
    expect(screen.getByText('Paso 1 de 2 · Productos')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Venta registrada' })).not.toBeInTheDocument();
  });

  it('si se cae la red, no da la venta por registrada y reintenta con la misma llave', async () => {
    const sale = makeSale({
      total: '68.00',
      paid: '68.00',
      balance: '0.00',
      paymentStatus: 'paid',
    });
    let attempts = 0;
    const keys: string[] = [];
    const { fetchMock } = stubApi({
      ...base,
      ...day(),
      'POST /sales': () => ({ status: 201, body: sale }),
      [`GET /sales/${sale.id}`]: { body: sale },
    });
    const real = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input) === '/api/sales' && init?.method === 'POST') {
        keys.push((init.headers as Record<string, string>)['idempotency-key']!);
        if (++attempts === 1) throw new TypeError('Failed to fetch');
      }
      return real(input, init);
    });
    const u = user();
    renderApp('/vender');
    await toStep2(u);
    await u.click(screen.getByRole('button', { name: /Confirmar venta/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se registró la venta: no hay conexión',
    );
    expect(screen.queryByRole('heading', { name: 'Venta registrada' })).not.toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: /Confirmar venta/ }));
    expect(await screen.findByRole('heading', { name: 'Venta registrada' })).toBeInTheDocument();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('el botón de confirmar se deshabilita sin conexión', async () => {
    stubApi({ ...base, ...day() });
    const u = user();
    renderApp('/vender');
    await toStep2(u);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Confirmar venta/ })).toBeDisabled(),
    );
  });

  it('el botón de regreso vuelve a los productos sin perder el borrador', async () => {
    stubApi({ ...base, ...day() });
    const u = user();
    renderApp('/vender');
    await toStep2(u);
    await u.click(screen.getByRole('button', { name: 'Volver a productos' }));
    expect(screen.getByText('3 piezas · 2 productos')).toBeInTheDocument();
  });
});
