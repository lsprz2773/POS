import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { App } from './App';
import { AuthProvider } from './auth/AuthContext';
import { es } from './i18n/es';
import { apiError, json, me, mockApi } from './test/mockApi';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('acceso a la aplicación', () => {
  it('sin sesión muestra el inicio de sesión', async () => {
    mockApi({
      'GET /api/me': () => apiError(401, 'unauthenticated'),
      'POST /api/auth/refresh': () => apiError(401, 'unauthenticated'),
    });
    renderApp('/tienda');
    expect(await screen.findByRole('heading', { name: es.auth.loginTitle })).toBeTruthy();
  });

  it('con sesión muestra la tienda y el correo', async () => {
    mockApi({
      'GET /api/me': () => json(me),
      'GET /api/health/ready': () => json({ status: 'ok' }),
    });
    renderApp();
    expect(await screen.findByText('Tienda A')).toBeTruthy();
    expect(screen.getByText('ana@tienda.test')).toBeTruthy();
  });

  it.each(['store_not_configured', 'tenant_disabled'] as const)(
    'muestra el estado bloqueado %s sin dar acceso',
    async (code) => {
      mockApi({ 'GET /api/me': () => apiError(403, code) });
      renderApp();
      expect(await screen.findByText(es.auth.blocked[code].message)).toBeTruthy();
      expect(screen.queryByText(es.home.welcome)).toBeNull();
    },
  );

  it('si el servidor falla no aparenta iniciar sesión y permite reintentar', async () => {
    mockApi({ 'GET /api/me': () => apiError(500, 'internal_error') });
    renderApp();
    expect(await screen.findByText(es.auth.serverUnavailable)).toBeTruthy();
    expect(screen.getByRole('button', { name: es.common.retry })).toBeTruthy();
  });

  it('inicia sesión y muestra un mensaje genérico si las credenciales fallan', async () => {
    let logged = false;
    mockApi({
      'GET /api/me': () => (logged ? json(me) : apiError(401, 'unauthenticated')),
      'POST /api/auth/refresh': () => apiError(401, 'unauthenticated'),
      'GET /api/health/ready': () => json({ status: 'ok' }),
      'POST /api/auth/login': (init) => {
        const body = JSON.parse(String(init?.body)) as { password: string };
        if (body.password === 'buena') {
          logged = true;
          return json({ status: 'ok' });
        }
        return apiError(401, 'invalid_credentials', 'Correo o contraseña incorrectos.');
      },
    });
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole('heading', { name: es.auth.loginTitle });

    await user.type(screen.getByLabelText(es.auth.email), 'ana@tienda.test');
    await user.type(screen.getByLabelText(es.auth.password), 'mala');
    await user.click(screen.getByRole('button', { name: es.auth.submit }));
    expect((await screen.findByRole('alert')).textContent).toBe('Correo o contraseña incorrectos.');

    await user.clear(screen.getByLabelText(es.auth.password));
    await user.type(screen.getByLabelText(es.auth.password), 'buena');
    await user.click(screen.getByRole('button', { name: es.auth.submit }));
    await waitFor(() => expect(screen.getByText('Tienda A')).toBeTruthy());
  });
});
