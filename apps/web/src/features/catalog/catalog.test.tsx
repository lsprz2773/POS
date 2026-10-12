import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ME,
  STORE,
  apiError,
  makeProduct,
  productList,
  renderApp,
  stubApi,
} from '../../test/helpers';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const base = { 'GET /me': { body: ME }, 'GET /store': { body: STORE } };

describe('catálogo', () => {
  it('muestra los productos con precio, costo y estado', async () => {
    const inactive = makeProduct({
      name: 'Agua 600 ml',
      code: 'AGU-01',
      active: false,
      price: '1200.5',
      cost: '7.00',
    });
    stubApi({
      ...base,
      'GET /products': productList([makeProduct(), inactive]),
    });
    renderApp('/catalogo');
    expect(await screen.findByText('Tamal de rajas')).toBeInTheDocument();
    expect(screen.getByText('TAM-01 · pieza')).toBeInTheDocument();
    expect(screen.getByText('$25.00')).toBeInTheDocument();
    expect(screen.getByText('Costo $14.00')).toBeInTheDocument();
    expect(screen.getByText('$1,200.50')).toBeInTheDocument();
    expect(screen.getByText('Inactivo')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Producto activo: Tamal de rajas' })).toBeChecked();
    expect(
      screen.getByRole('switch', { name: 'Producto inactivo: Agua 600 ml' }),
    ).not.toBeChecked();
  });

  it('pide los activos por omisión y cambia de filtro', async () => {
    const { calls } = stubApi({ ...base, 'GET /products': productList([makeProduct()]) });
    renderApp('/catalogo');
    await screen.findByText('Tamal de rajas');
    expect(calls.find((c) => c.key === 'GET /products')!.url).toContain('status=active');

    await userEvent.click(screen.getByRole('button', { name: 'Inactivos' }));
    await waitFor(() => expect(calls.some((c) => c.url.includes('status=inactive'))).toBe(true));
    expect(screen.getByRole('button', { name: 'Inactivos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('busca por nombre o código con una pausa entre teclas', async () => {
    const { calls } = stubApi({ ...base, 'GET /products': productList([makeProduct()]) });
    renderApp('/catalogo');
    await screen.findByText('Tamal de rajas');
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Buscar por nombre o código' }),
      'tam',
    );
    await waitFor(() => expect(calls.some((c) => c.url.includes('q=tam'))).toBe(true));
    // Una sola consulta con el texto completo, no una por tecla.
    expect(calls.filter((c) => c.url.includes('q=')).length).toBe(1);
  });

  it('sin productos invita a agregar el primero', async () => {
    stubApi({ ...base, 'GET /products': productList([]) });
    renderApp('/catalogo');
    expect(
      await screen.findByRole('heading', { name: 'Aún no tienes productos' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Agregar producto' })).toHaveAttribute(
      'href',
      '/catalogo/nuevo',
    );
  });

  it('una búsqueda sin resultados lo explica', async () => {
    stubApi({
      ...base,
      'GET /products': productList([]),
    });
    renderApp('/catalogo');
    await screen.findByRole('heading', { name: 'Aún no tienes productos' });
    await userEvent.click(screen.getByRole('button', { name: 'Todos' }));
    expect(
      await screen.findByRole('heading', { name: 'No encontramos productos' }),
    ).toBeInTheDocument();
  });

  it('si falla la carga ofrece reintentar', async () => {
    let attempts = 0;
    stubApi({
      ...base,
      'GET /products': () =>
        ++attempts === 1 ? apiError(500, 'internal_error', 'x') : productList([makeProduct()]),
    });
    renderApp('/catalogo');
    expect(await screen.findByRole('alert')).toHaveTextContent('req-123');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Tamal de rajas')).toBeInTheDocument();
  });

  it('carga más de 50 productos por partes', async () => {
    const first = Array.from({ length: 50 }, (_, i) =>
      makeProduct({ name: `Producto ${i}`, code: null }),
    );
    const second = [makeProduct({ name: 'Producto final', code: null })];
    const { calls } = stubApi({
      ...base,
      'GET /products': () =>
        calls.some((c) => c.url.includes('offset=50'))
          ? productList(second, 51, 50)
          : productList(first, 51, 0),
    });
    renderApp('/catalogo');
    await screen.findByText('Producto 0');
    await userEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    expect(await screen.findByText('Producto final')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('desactivar un producto envía la versión que se vio y avisa que el historial se conserva', async () => {
    const product = makeProduct({ version: 3 });
    const { calls } = stubApi({
      ...base,
      'GET /products': productList([product]),
      [`PATCH /products/${product.id}`]: { body: { ...product, active: false, version: 4 } },
    });
    renderApp('/catalogo');
    await userEvent.click(
      await screen.findByRole('switch', { name: 'Producto activo: Tamal de rajas' }),
    );
    expect(await screen.findByText(/Sus ventas anteriores se conservan/)).toBeInTheDocument();
    expect(calls.find((c) => c.key.startsWith('PATCH'))!.body).toEqual({
      version: 3,
      active: false,
    });
  });

  it('si otra sesión cambió el producto, muestra el aviso del servidor', async () => {
    const product = makeProduct();
    stubApi({
      ...base,
      'GET /products': productList([product]),
      [`PATCH /products/${product.id}`]: apiError(
        409,
        'conflict',
        'Este producto cambió mientras lo editabas.',
      ),
    });
    renderApp('/catalogo');
    await userEvent.click(await screen.findByRole('switch', { name: /Producto activo/ }));
    expect(
      await screen.findByText('Este producto cambió mientras lo editabas.'),
    ).toBeInTheDocument();
  });

  it('sin conexión deshabilita los interruptores', async () => {
    stubApi({ ...base, 'GET /products': productList([makeProduct()]) });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderApp('/catalogo');
    expect(await screen.findByRole('switch', { name: /Producto activo/ })).toBeDisabled();
    expect(screen.getByRole('status', { name: '' })).toBeInTheDocument();
  });

  it('desde Más se llega al catálogo y se puede volver', async () => {
    stubApi({ ...base, 'GET /products': productList([makeProduct()]) });
    renderApp('/mas');
    await userEvent.click(await screen.findByRole('link', { name: /Catálogo/ }));
    await screen.findByText('Tamal de rajas');
    const header = screen.getByRole('heading', { name: 'Catálogo' }).parentElement!;
    await userEvent.click(within(header).getByRole('link', { name: 'Volver a Más' }));
    expect(await screen.findByRole('heading', { name: 'Más' })).toBeInTheDocument();
  });
});
