import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ME, apiError, renderApp, stubApi } from '../../test/helpers';

afterEach(() => vi.unstubAllGlobals());

describe('puerta de sesión', () => {
  it('sin sesión lleva al inicio de sesión', async () => {
    stubApi({
      'GET /me': apiError(401, 'unauthenticated', 'Sin sesión'),
      'POST /auth/refresh': apiError(401, 'unauthenticated', 'x'),
    });
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument();
  });

  it('con sesión muestra la navegación y la pantalla pedida', async () => {
    stubApi({ 'GET /me': { body: ME } });
    renderApp('/pendientes');
    expect(await screen.findByRole('heading', { name: 'Pendientes' })).toBeInTheDocument();
    const nav = screen.getAllByRole('navigation', { name: 'Navegación principal' });
    expect(nav.length).toBeGreaterThan(0);
    expect(within(nav[0]!).getByRole('link', { name: 'Vender' })).toBeInTheDocument();
  });

  it('marca la pantalla actual en la navegación', async () => {
    stubApi({ 'GET /me': { body: ME } });
    renderApp('/pendientes');
    await screen.findByRole('heading', { name: 'Pendientes' });
    const current = screen.getAllByRole('link', { current: 'page' });
    expect(current.length).toBeGreaterThan(0);
    current.forEach((link) => expect(link).toHaveTextContent('Pendientes'));
  });

  it.each([
    ['store_not_configured', 'Tu cuenta aún no tiene una tienda'],
    ['tenant_disabled', 'Tu tienda está desactivada'],
  ])('cuenta bloqueada (%s) solo permite cerrar sesión', async (code, title) => {
    stubApi({ 'GET /me': apiError(403, code, 'Bloqueada') });
    renderApp('/');
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('si el servidor falla ofrece reintentar y no deja pasar', async () => {
    let attempts = 0;
    stubApi({
      'GET /me': () => (++attempts === 1 ? apiError(500, 'internal_error', 'x') : { body: ME }),
    });
    renderApp('/');
    expect(await screen.findByRole('alert')).toHaveTextContent('req-123');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Hoy' })).toBeInTheDocument();
  });

  it('una ruta inexistente explica que no existe', async () => {
    stubApi({ 'GET /me': { body: ME } });
    renderApp('/no-existe');
    expect(
      await screen.findByRole('heading', { name: 'No encontramos esta página' }),
    ).toBeInTheDocument();
  });
});

describe('inicio de sesión', () => {
  const anonymous = {
    'GET /me': apiError(401, 'unauthenticated', 'Sin sesión'),
    'POST /auth/refresh': apiError(401, 'unauthenticated', 'x'),
  };

  async function open() {
    const view = renderApp('/login');
    await screen.findByRole('heading', { name: 'Inicia sesión' });
    return view;
  }

  it('valida en el cliente, enfoca el primer error y no llama al servidor', async () => {
    const { calls } = stubApi(anonymous);
    await open();
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'no-es-correo');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(screen.getByLabelText('Correo electrónico')).toHaveFocus();
    expect(screen.getByLabelText('Correo electrónico')).toHaveAccessibleDescription(
      'Escribe un correo válido.',
    );
    expect(screen.getByLabelText('Contraseña')).toHaveAccessibleDescription(
      'Escribe tu contraseña.',
    );
    expect(calls.some((c) => c.key === 'POST /auth/login')).toBe(false);
  });

  it('con credenciales incorrectas muestra un mensaje genérico y limpia la contraseña', async () => {
    stubApi({
      ...anonymous,
      'POST /auth/login': apiError(401, 'invalid_credentials', 'Correo o contraseña incorrectos.'),
    });
    await open();
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@tienda.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'incorrecta');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos.');
    expect(screen.getByLabelText('Contraseña')).toHaveValue('');
    expect(screen.getByLabelText('Contraseña')).toHaveFocus();
  });

  it('con credenciales correctas entra a la aplicación', async () => {
    let loggedIn = false;
    const { calls } = stubApi({
      'GET /me': () => (loggedIn ? { body: ME } : apiError(401, 'unauthenticated', 'x')),
      'POST /auth/refresh': apiError(401, 'unauthenticated', 'x'),
      'POST /auth/login': () => {
        loggedIn = true;
        return { body: { status: 'ok' } };
      },
    });
    await open();
    await userEvent.type(screen.getByLabelText('Correo electrónico'), '  Ana@Tienda.test ');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByRole('heading', { name: 'Hoy' })).toBeInTheDocument();
    expect(calls.find((c) => c.key === 'POST /auth/login')!.body).toEqual({
      email: 'Ana@Tienda.test',
      password: 'x',
    });
  });

  it('sin conexión explica el problema', async () => {
    stubApi(anonymous);
    await open();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@tienda.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/No hay conexión con el servidor/);
  });
});

describe('perfil y cierre de sesión', () => {
  it('muestra los datos de la cuenta y al cerrar sesión limpia todo y vuelve al inicio de sesión', async () => {
    let loggedOut = false;
    const { calls } = stubApi({
      'GET /me': () => (loggedOut ? apiError(401, 'unauthenticated', 'x') : { body: ME }),
      'POST /auth/refresh': apiError(401, 'unauthenticated', 'x'),
      'POST /auth/logout': () => {
        loggedOut = true;
        return { status: 204 };
      },
    });
    renderApp('/perfil');
    expect(await screen.findByText('ana@tienda.test')).toBeInTheDocument();
    expect(screen.getByText('Tamales Ana')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Cerraste sesión.');
    await waitFor(() => expect(calls.some((c) => c.key === 'POST /auth/logout')).toBe(true));
  });
});

describe('menú Más', () => {
  it('lista Catálogo, Historial, Reportes, Configuración y Perfil', async () => {
    stubApi({ 'GET /me': { body: ME } });
    renderApp('/mas');
    await screen.findByRole('heading', { name: 'Más' });
    const menu = screen.getByRole('navigation', { name: 'Más' });
    for (const name of ['Catálogo', 'Historial', 'Reportes', 'Configuración', 'Perfil']) {
      expect(within(menu).getByRole('link', { name })).toBeInTheDocument();
    }
  });
});
