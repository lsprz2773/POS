import { screen, waitFor } from '@testing-library/react';
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

afterEach(() => vi.unstubAllGlobals());

const base = { 'GET /me': { body: ME }, 'GET /store': { body: STORE } };
const user = userEvent.setup();

async function fillNew(
  values: { name?: string; price?: string; cost?: string; code?: string } = {},
) {
  const { name = 'Tamal de rajas', price = '25', cost = '14', code } = values;
  await user.type(await screen.findByLabelText('Nombre *'), name);
  await user.type(screen.getByLabelText('Precio de venta *'), price);
  await user.type(screen.getByLabelText('Costo *'), cost);
  if (code) await user.type(screen.getByLabelText('Código interno'), code);
}

describe('nuevo producto', () => {
  it('con campos obligatorios vacíos marca los errores, enfoca el primero y no llama al servidor', async () => {
    const { calls } = stubApi(base);
    renderApp('/catalogo/nuevo');
    await user.click(await screen.findByRole('button', { name: 'Guardar producto' }));
    expect(screen.getByLabelText('Nombre *')).toHaveFocus();
    expect(screen.getByLabelText('Nombre *')).toHaveAccessibleDescription(
      'Escribe el nombre del producto.',
    );
    expect(screen.getByLabelText('Precio de venta *')).toHaveAccessibleDescription(
      /Escribe un importe/,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('No se guardó el producto');
    expect(calls.some((c) => c.key === 'POST /products')).toBe(false);
  });

  it('guarda con importes normalizados, avisa y vuelve al catálogo', async () => {
    const created = makeProduct();
    const { calls } = stubApi({
      ...base,
      'POST /products': { status: 201, body: created },
      'GET /products': productList([created]),
    });
    renderApp('/catalogo/nuevo');
    await fillNew({ code: 'TAM-01' });
    await user.click(screen.getByRole('button', { name: 'Guardar producto' }));
    expect(await screen.findByText('Producto guardado.')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Catálogo' })).toBeInTheDocument();
    expect(calls.find((c) => c.key === 'POST /products')!.body).toEqual({
      name: 'Tamal de rajas',
      price: '25.00',
      cost: '14.00',
      unit: 'pieza',
      code: 'TAM-01',
      category: null,
      description: null,
      notes: null,
    });
  });

  it('nunca envía datos de la tienda ni del cliente: solo los campos del producto', async () => {
    const { calls } = stubApi({
      ...base,
      'POST /products': { status: 201, body: makeProduct() },
      'GET /products': productList([]),
    });
    renderApp('/catalogo/nuevo');
    await fillNew();
    await user.click(screen.getByRole('button', { name: 'Guardar producto' }));
    await waitFor(() => expect(calls.some((c) => c.key === 'POST /products')).toBe(true));
    const body = calls.find((c) => c.key === 'POST /products')!.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      ['category', 'code', 'cost', 'description', 'name', 'notes', 'price', 'unit'].sort(),
    );
  });

  it('si el código ya existe, lo marca en ese campo y conserva lo escrito', async () => {
    stubApi({
      ...base,
      'POST /products': {
        status: 409,
        body: {
          code: 'conflict',
          error: 'Ya existe un producto con ese código.',
          fields: { code: 'Ya existe un producto con ese código.' },
        },
      },
    });
    renderApp('/catalogo/nuevo');
    await fillNew({ code: 'TAM-01' });
    await user.click(screen.getByRole('button', { name: 'Guardar producto' }));
    expect(await screen.findByLabelText('Código interno')).toHaveAccessibleDescription(
      'Ya existe un producto con ese código.',
    );
    expect(screen.getByLabelText('Código interno')).toHaveFocus();
    expect(screen.getByLabelText('Nombre *')).toHaveValue('Tamal de rajas');
  });

  it('si el servidor falla, avisa y no pierde los datos', async () => {
    stubApi({ ...base, 'POST /products': apiError(500, 'internal_error', 'x') });
    renderApp('/catalogo/nuevo');
    await fillNew();
    await user.click(screen.getByRole('button', { name: 'Guardar producto' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Algo salió mal');
    expect(screen.getByLabelText('Precio de venta *')).toHaveValue('25');
    expect(screen.getByRole('button', { name: 'Guardar producto' })).toBeEnabled();
  });

  it('no permite guardar sin conexión', async () => {
    stubApi(base);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderApp('/catalogo/nuevo');
    expect(await screen.findByRole('button', { name: 'Guardar producto' })).toBeDisabled();
    vi.restoreAllMocks();
  });
});

describe('salir sin guardar', () => {
  it('con cambios pregunta antes de salir y permite seguir editando', async () => {
    stubApi({ ...base, 'GET /products': productList([]) });
    renderApp('/catalogo/nuevo');
    await user.type(await screen.findByLabelText('Nombre *'), 'Tamal');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    const dialog = await screen.findByRole('alertdialog', { name: '¿Salir sin guardar?' });
    // El foco inicial queda en la salida segura, no en descartar.
    expect(screen.getByRole('button', { name: 'Seguir editando' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(dialog).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nombre *')).toHaveValue('Tamal');
  });

  it('descartar los cambios sale al catálogo', async () => {
    stubApi({ ...base, 'GET /products': productList([]) });
    renderApp('/catalogo/nuevo');
    await user.type(await screen.findByLabelText('Nombre *'), 'Tamal');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await user.click(await screen.findByRole('button', { name: 'Descartar cambios' }));
    expect(await screen.findByRole('heading', { name: 'Catálogo' })).toBeInTheDocument();
  });

  it('sin cambios sale directo, sin preguntar', async () => {
    stubApi({ ...base, 'GET /products': productList([]) });
    renderApp('/catalogo/nuevo');
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByRole('heading', { name: 'Catálogo' })).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

describe('editar producto', () => {
  const product = makeProduct({ version: 4, description: 'Con salsa verde' });
  const routes = () => ({
    ...base,
    [`GET /products/${product.id}`]: { body: product },
    'GET /products': productList([product]),
  });

  it('carga el producto con sus valores y el interruptor de activo', async () => {
    stubApi(routes());
    renderApp(`/catalogo/${product.id}`);
    expect(await screen.findByLabelText('Nombre *')).toHaveValue('Tamal de rajas');
    expect(screen.getByLabelText('Precio de venta *')).toHaveValue('25.00');
    expect(screen.getByLabelText('Descripción')).toHaveValue('Con salsa verde');
    expect(screen.getByRole('switch', { name: 'Producto activo' })).toBeChecked();
  });

  it('envía solo lo cambiado, con la versión que se cargó', async () => {
    const { calls } = stubApi({
      ...routes(),
      [`PATCH /products/${product.id}`]: { body: { ...product, price: '30.00', version: 5 } },
    });
    renderApp(`/catalogo/${product.id}`);
    const price = await screen.findByLabelText('Precio de venta *');
    await user.clear(price);
    await user.type(price, '30');
    await user.click(screen.getByRole('button', { name: 'Guardar producto' }));
    expect(await screen.findByText('Producto guardado.')).toBeInTheDocument();
    expect(calls.find((c) => c.key.startsWith('PATCH'))!.body).toEqual({
      version: 4,
      price: '30.00',
    });
  });

  it('desactivar desde el formulario envía active:false', async () => {
    const { calls } = stubApi({
      ...routes(),
      [`PATCH /products/${product.id}`]: { body: { ...product, active: false, version: 5 } },
    });
    renderApp(`/catalogo/${product.id}`);
    await user.click(await screen.findByRole('switch', { name: 'Producto activo' }));
    await user.click(screen.getByRole('button', { name: 'Guardar producto' }));
    await screen.findByText('Producto guardado.');
    expect(calls.find((c) => c.key.startsWith('PATCH'))!.body).toEqual({
      version: 4,
      active: false,
    });
  });

  it('sin cambios no llama al servidor y lo dice', async () => {
    const { calls } = stubApi(routes());
    renderApp(`/catalogo/${product.id}`);
    await user.click(await screen.findByRole('button', { name: 'Guardar producto' }));
    expect(await screen.findByText('No hay cambios por guardar.')).toBeInTheDocument();
    expect(calls.some((c) => c.key.startsWith('PATCH'))).toBe(false);
  });

  it('si otra sesión lo cambió, explica y permite cargar la versión actual', async () => {
    let served = 0;
    stubApi({
      ...base,
      [`GET /products/${product.id}`]: () => ({
        body: ++served === 1 ? product : { ...product, version: 5, price: '28.00' },
      }),
      [`PATCH /products/${product.id}`]: apiError(
        409,
        'conflict',
        'Este producto cambió mientras lo editabas.',
      ),
    });
    renderApp(`/catalogo/${product.id}`);
    const price = await screen.findByLabelText('Precio de venta *');
    await user.clear(price);
    await user.type(price, '30');
    await user.click(screen.getByRole('button', { name: 'Guardar producto' }));
    expect(await screen.findByText(/cambió mientras lo editabas/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cargar la versión actual' }));
    await waitFor(() => expect(screen.getByLabelText('Precio de venta *')).toHaveValue('28.00'));
  });

  it('un producto que ya no existe muestra el error con reintentar', async () => {
    stubApi({
      ...base,
      'GET /products/00000000-0000-4000-8000-0000000000aa': apiError(
        404,
        'not_found',
        'Este producto ya no está disponible.',
      ),
    });
    renderApp('/catalogo/00000000-0000-4000-8000-0000000000aa');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este producto ya no está disponible.',
    );
    expect(screen.getByRole('link', { name: 'Volver al catálogo' })).toBeInTheDocument();
  });
});
