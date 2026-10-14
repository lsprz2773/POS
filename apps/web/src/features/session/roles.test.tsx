import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ME,
  SELLER_ME,
  STORE,
  apiError,
  makeDashboard,
  makeMember,
  makeOffer,
  makeSale,
  makeSellerDetail,
  makeSellerRow,
  makeSellersReport,
  makeTeam,
  makeWorkday,
  pendingItem,
  renderApp,
  saleSummary,
  stubApi,
} from '../../test/helpers';

afterEach(() => vi.unstubAllGlobals());

const owner = { 'GET /me': { body: ME }, 'GET /store': { body: STORE } };
const seller = { 'GET /me': { body: SELLER_ME }, 'GET /store': { body: STORE } };
const vera = makeMember();

describe('vendedor', () => {
  it('Más muestra solo lo que puede usar, con Mis ventas y Mis reportes', async () => {
    stubApi(seller);
    renderApp('/mas');
    const nav = await screen.findByRole('navigation', { name: 'Más' });
    const labels = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(labels).toEqual(['Mis ventas', 'Mis reportes', 'Perfil']);
  });

  it('el propietario ve además Catálogo, Configuración y Equipo', async () => {
    stubApi({ ...owner, 'GET /team': makeTeam([]) });
    renderApp('/mas');
    const nav = await screen.findByRole('navigation', { name: 'Más' });
    const labels = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(labels).toEqual([
      'Catálogo',
      'Historial',
      'Reportes',
      'Equipo',
      'Configuración',
      'Perfil',
    ]);
  });

  it('los reportes por vendedor aparecen en Más solo cuando hay vendedores', async () => {
    stubApi({ ...owner, 'GET /team': makeTeam([vera]) });
    renderApp('/mas');
    expect(await screen.findByRole('link', { name: 'Reportes por vendedor' })).toHaveAttribute(
      'href',
      '/reportes/equipo',
    );
  });

  it.each([
    ['/catalogo', 'Catálogo'],
    ['/catalogo/nuevo', 'Catálogo'],
    ['/configuracion', 'Configuración'],
    ['/equipo', 'Equipo'],
    ['/reportes/equipo', 'Reportes por vendedor'],
  ])('si pega la dirección %s vuelve a Hoy con un aviso', async (path) => {
    stubApi({ ...seller, 'GET /dashboard': { body: makeDashboard() } });
    renderApp(path);
    expect(await screen.findByRole('heading', { name: 'Hoy' })).toBeInTheDocument();
    expect(await screen.findByText('No tienes acceso a esa pantalla.')).toBeInTheDocument();
  });

  it('el perfil dice que es vendedor', async () => {
    stubApi(seller);
    renderApp('/perfil');
    const profile = await screen.findByRole('heading', { name: 'Perfil' });
    expect(profile).toBeInTheDocument();
    expect(screen.getByText('Vendedor')).toBeInTheDocument();
  });

  it('Mis ventas es el historial de lo suyo y no muestra filtro de vendedor', async () => {
    stubApi({
      ...seller,
      'GET /sales': { body: { items: [saleSummary()], total: 1, limit: 50, offset: 0 } },
    });
    const u = userEvent.setup();
    renderApp('/historial');
    expect(await screen.findByRole('heading', { name: 'Mis ventas' })).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: /Todas las fechas/ }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).queryByLabelText('Vendedor')).not.toBeInTheDocument();
  });

  it('prepara su propio día con productos del catálogo, igual que el propietario', async () => {
    stubApi({
      ...seller,
      'GET /workdays/2026-10-15': { body: makeWorkday([makeOffer({ productName: 'Tamal' })]) },
    });
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-15T18:00:00Z') });
    renderApp('/dia');
    expect(await screen.findByRole('heading', { name: 'Preparar día' })).toBeInTheDocument();
    expect(await screen.findByText('Tamal')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('un vendedor dado de baja en pleno uso ve la pantalla de cuenta dada de baja', async () => {
    let me = 0;
    stubApi({
      'GET /me': () =>
        ++me === 1
          ? { body: SELLER_ME }
          : apiError(403, 'membership_disabled', 'Tu cuenta fue dada de baja.'),
      'GET /store': { body: STORE },
      'GET /dashboard': apiError(403, 'membership_disabled', 'Tu cuenta fue dada de baja.'),
    });
    renderApp('/');
    expect(
      await screen.findByRole('heading', { name: 'Tu cuenta fue dada de baja' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('una cuenta dada de baja que entra de nuevo solo puede cerrar sesión', async () => {
    stubApi({ 'GET /me': apiError(403, 'membership_disabled', 'Tu cuenta fue dada de baja.') });
    renderApp('/');
    expect(
      await screen.findByRole('heading', { name: 'Tu cuenta fue dada de baja' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/habla con el propietario/)).toBeInTheDocument();
  });
});

describe('propietario con vendedores', () => {
  it('Hoy suma el bloque Por vendedor con lo de hoy y lo que se le debe a cada uno', async () => {
    stubApi({
      ...owner,
      'GET /dashboard': {
        body: makeDashboard({
          bySeller: [
            {
              userId: vera.id,
              name: 'Vera López',
              status: 'active',
              salesTotal: '150.00',
              salesCount: 2,
              collected: '90.00',
              owed: { total: '60.00', count: 1 },
            },
          ],
        }),
      },
    });
    renderApp('/');
    const block = await screen.findByRole('region', { name: 'Por vendedor' });
    expect(within(block).getByText('Vera López')).toBeInTheDocument();
    expect(within(block).getByText('$150.00')).toBeInTheDocument();
    expect(block).toHaveTextContent('Cobrado $90.00');
    expect(block).toHaveTextContent('Por cobrar $60.00');
  });

  it('sin vendedores Hoy no cambia', async () => {
    stubApi({ ...owner, 'GET /dashboard': { body: makeDashboard() } });
    renderApp('/');
    await screen.findByRole('region', { name: 'Cobrado' });
    expect(screen.queryByRole('region', { name: 'Por vendedor' })).not.toBeInTheDocument();
  });

  it('Pendientes muestra lo que debe cada persona y filtra al tocarla', async () => {
    const sale = makeSale({ createdBy: { id: vera.id, name: 'Vera López' } });
    const { calls } = stubApi({
      ...owner,
      'GET /team': makeTeam([vera]),
      'GET /sales/pending': {
        body: {
          items: [pendingItem(sale)],
          total: 2,
          totalBalance: '135.00',
          bySeller: [
            { userId: vera.id, name: 'Vera López', status: 'active', total: '60.00', count: 1 },
            { userId: 'u1', name: 'ana@tienda.test', status: 'active', total: '75.00', count: 1 },
          ],
          limit: 50,
          offset: 0,
        },
      },
    });
    const u = userEvent.setup();
    renderApp('/pendientes');
    const block = await screen.findByRole('region', { name: 'Por vendedor' });
    expect(
      within(block).getByRole('button', { name: 'Ver los pendientes de Vera López' }),
    ).toHaveTextContent('$60.00');
    // Cada venta dice quién la registró.
    expect(await screen.findByText(/Vera López$/, { selector: '.cap' })).toBeInTheDocument();

    await u.click(within(block).getByRole('button', { name: 'Ver los pendientes de Vera López' }));
    await waitFor(() =>
      expect(calls.filter((c) => c.key === 'GET /sales/pending').at(-1)!.url).toContain(
        `sellerId=${vera.id}`,
      ),
    );
    expect(
      screen.getByRole('button', { name: /Vera López · Todas las fechas/ }),
    ).toBeInTheDocument();
  });

  it('el filtro de Historial incluye a los vendedores y manda el elegido', async () => {
    const { calls } = stubApi({
      ...owner,
      'GET /team': makeTeam([vera]),
      'GET /sales': {
        body: {
          items: [saleSummary({ createdBy: { id: vera.id, name: 'Vera López' } })],
          total: 1,
          limit: 50,
          offset: 0,
        },
      },
    });
    const u = userEvent.setup();
    renderApp('/historial');
    expect(await screen.findByText(/Vera López/, { selector: '.cap' })).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: /Todas las fechas/ }));
    const sheet = await screen.findByRole('dialog');
    const select = within(sheet).getByLabelText('Vendedor');
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Todos los vendedores', 'Tú', 'Vera López']);
    await u.selectOptions(select, vera.id);
    await u.click(within(sheet).getByRole('button', { name: 'Aplicar filtro' }));
    await waitFor(() =>
      expect(calls.filter((c) => c.key === 'GET /sales').at(-1)!.url).toContain(
        `sellerId=${vera.id}`,
      ),
    );
  });

  it('el detalle de una venta de un vendedor dice quién la registró; la propia no', async () => {
    const sale = makeSale({ createdBy: { id: vera.id, name: 'Vera López' } });
    stubApi({ ...owner, [`GET /sales/${sale.id}`]: { body: sale } });
    renderApp(`/ventas/${sale.id}`);
    expect(await screen.findByText('Vendedor')).toBeInTheDocument();
    expect(screen.getByText('Vera López')).toBeInTheDocument();
  });

  it('el detalle de una venta propia no repite el vendedor', async () => {
    const sale = makeSale();
    stubApi({ ...owner, [`GET /sales/${sale.id}`]: { body: sale } });
    renderApp(`/ventas/${sale.id}`);
    await screen.findByText('Productos');
    expect(screen.queryByText('Vendedor')).not.toBeInTheDocument();
  });

  it('"Ver su día" muestra el inventario del vendedor, solo para consultar', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-15T18:00:00Z') });
    const { calls } = stubApi({
      ...owner,
      'GET /team': makeTeam([vera]),
      'GET /workdays/2026-10-15': {
        body: makeWorkday([makeOffer({ productName: 'Tamal de Vera' })]),
      },
    });
    renderApp(`/dia/inventario?vendedor=${vera.id}`);
    expect(await screen.findByText('Tamal de Vera')).toBeInTheDocument();
    expect(calls.find((c) => c.key === 'GET /workdays/2026-10-15')!.url).toBe(
      `/workdays/2026-10-15?sellerId=${vera.id}`,
    );
    expect(await screen.findByText(/Día de Vera López/)).toBeInTheDocument();
    // Nada para editar: no hay botón de preparar.
    expect(screen.queryByRole('link', { name: 'Preparar' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver' })).toHaveAttribute('href', '/equipo');
    vi.useRealTimers();
  });
});

describe('reportes del equipo', () => {
  const raulRow = makeSellerRow({
    userId: '90000000-0000-4000-8000-000000000002',
    name: 'raul@tienda.test',
    salesTotal: '75.00',
    salesCount: 1,
    collected: '0.00',
    grossProfit: '33.00',
    share: '30.00',
    owed: { total: '75.00', count: 1 },
    cancelled: { count: 1, total: '25.00', refundDue: '0.00', rate: '50.00' },
  });

  it('lista a cada persona con ventas, utilidad bruta, cobrado y lo que se le debe', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-15T18:00:00Z') });
    const { calls } = stubApi({
      ...owner,
      'GET /reports/sellers': makeSellersReport([makeSellerRow(), raulRow]),
    });
    renderApp('/reportes/equipo');
    expect(
      await screen.findByRole('heading', { name: 'Reportes por vendedor' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(calls.find((c) => c.key === 'GET /reports/sellers')?.url).toBe(
        '/reports/sellers?period=week&date=2026-10-12',
      ),
    );
    const totals = await screen.findByRole('region', { name: 'Toda la tienda' });
    expect(within(totals).getByText('$250.00')).toBeInTheDocument();
    expect(within(totals).getByText('Lo que te deben en total')).toBeInTheDocument();
    expect(within(totals).getByText('$135.00')).toBeInTheDocument();

    const list = screen.getByRole('list', { name: 'Ventas por persona' });
    const [vera_, raul_] = within(list).getAllByRole('link');
    expect(vera_).toHaveAttribute('href', `/reportes/equipo/${vera.id}`);
    expect(vera_).toHaveTextContent('Vera López');
    expect(vera_).toHaveTextContent('$150.00');
    expect(vera_).toHaveTextContent('60.00 % de las ventas');
    expect(vera_).toHaveTextContent('$66.00');
    expect(vera_).toHaveTextContent('$60.00');
    expect(raul_).toHaveTextContent('1 cancelada');
    vi.useRealTimers();
  });

  it('sin vendedores explica que los reportes aparecen al agregar al primero', async () => {
    stubApi({
      ...owner,
      'GET /reports/sellers': makeSellersReport([makeSellerRow({ role: 'owner' })], {
        hasSellers: false,
      }),
    });
    renderApp('/reportes/equipo');
    expect(await screen.findByText('Aún no tienes vendedores')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Agregar vendedor' })).toHaveAttribute(
      'href',
      '/equipo',
    );
  });

  it('un error del servidor se puede reintentar', async () => {
    let attempts = 0;
    stubApi({
      ...owner,
      'GET /reports/sellers': () =>
        ++attempts === 1
          ? apiError(500, 'internal_error', 'x')
          : makeSellersReport([makeSellerRow()]),
    });
    const u = userEvent.setup();
    renderApp('/reportes/equipo');
    await u.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('region', { name: 'Toda la tienda' })).toBeInTheDocument();
  });

  it('el detalle de un vendedor trae lo que se le debe con antigüedad, comparativo, serie y aprovechamiento', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-15T18:00:00Z') });
    const { calls } = stubApi({
      ...owner,
      [`GET /reports/sellers/${vera.id}`]: makeSellerDetail(),
    });
    renderApp(`/reportes/equipo/${vera.id}`);
    expect(await screen.findByRole('heading', { name: 'Vera López' })).toBeInTheDocument();
    await waitFor(() =>
      expect(calls.find((c) => c.key === `GET /reports/sellers/${vera.id}`)?.url).toBe(
        `/reports/sellers/${vera.id}?period=week&date=2026-10-12`,
      ),
    );

    const owed = await screen.findByRole('region', { name: 'Lo que se le debe' });
    expect(within(owed).getByText('$60.00')).toBeInTheDocument();
    expect(within(owed).getByText('$85.00')).toBeInTheDocument();
    expect(owed).toHaveTextContent('Más de 30 días');
    expect(owed).toHaveTextContent('$50.00');

    // Reutiliza las cifras del reporte general: ventas, cobrado, utilidad bruta y productos.
    expect(screen.getByRole('region', { name: 'Utilidad bruta' })).toHaveTextContent('$66.00');
    expect(screen.getByRole('region', { name: 'Productos más vendidos' })).toHaveTextContent(
      'Tamal de rajas',
    );

    const compare = screen.getByRole('region', { name: 'Contra el periodo anterior' });
    expect(compare).toHaveTextContent('$150.00');
    expect(compare).toHaveTextContent('$50.00');
    expect(screen.getByRole('region', { name: 'Ventas por día' })).toHaveTextContent('$150.00');
    const usage = screen.getByRole('region', { name: 'Aprovechamiento del día' });
    expect(usage).toHaveTextContent('12.00 % vendido');
    vi.useRealTimers();
  });

  it('el detalle de alguien que no existe explica que ya no está disponible', async () => {
    stubApi({
      ...owner,
      [`GET /reports/sellers/${vera.id}`]: apiError(
        404,
        'not_found',
        'Esa persona ya no está disponible.',
      ),
    });
    renderApp(`/reportes/equipo/${vera.id}`);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esa persona ya no está disponible.',
    );
  });
});
