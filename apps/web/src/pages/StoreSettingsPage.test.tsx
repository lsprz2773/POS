import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { StoreSettingsPage } from './StoreSettingsPage';
import { es } from '../i18n/es';
import { json, mockApi } from '../test/mockApi';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const settings = {
  name: 'Tienda A',
  currency: 'MXN',
  timezone: 'America/Mexico_City',
  workdayStart: '08:00',
  workdayEnd: '16:00',
  operatingDays: [1, 2, 3, 4, 5],
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <StoreSettingsPage />
    </MemoryRouter>,
  );

describe('configuración de la tienda', () => {
  it('no envía nada si el nombre está vacío y muestra el error junto al campo', async () => {
    const spy = mockApi({ 'GET /api/store': () => json(settings) });
    const user = userEvent.setup();
    renderPage();
    const name = await screen.findByLabelText(es.store.name);
    await user.clear(name);
    await user.click(screen.getByRole('button', { name: es.common.save }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(spy).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText(es.store.name) as HTMLInputElement).value).toBe('');
  });

  it('guarda los cambios y confirma', async () => {
    const spy = mockApi({
      'GET /api/store': () => json(settings),
      'PATCH /api/store': (init) =>
        json({ ...settings, ...(JSON.parse(String(init?.body)) as object) }),
    });
    const user = userEvent.setup();
    renderPage();
    const name = await screen.findByLabelText(es.store.name);
    await user.clear(name);
    await user.type(name, 'Cooperativa');
    await user.click(screen.getByLabelText(es.days[6]!));
    await user.click(screen.getByRole('button', { name: es.common.save }));
    expect(await screen.findByText(es.store.saved)).toBeTruthy();

    const patch = spy.mock.calls.find(([, init]) => init?.method === 'PATCH')!;
    const body = JSON.parse(String(patch[1]?.body)) as Record<string, unknown>;
    expect(body.name).toBe('Cooperativa');
    expect(body.operatingDays).toEqual([1, 2, 3, 4, 5, 6]);
    expect(body).not.toHaveProperty('currency');
    expect(body).not.toHaveProperty('tenantId');
  });

  it('muestra los errores por campo que devuelve el servidor y conserva lo escrito', async () => {
    mockApi({
      'GET /api/store': () => json(settings),
      'PATCH /api/store': () =>
        json(
          {
            code: 'validation_error',
            error: 'Revisa',
            fields: { name: 'Ya existe una tienda así.' },
          },
          400,
        ),
    });
    const user = userEvent.setup();
    renderPage();
    const name = await screen.findByLabelText(es.store.name);
    await user.clear(name);
    await user.type(name, 'Repetida');
    await user.click(screen.getByRole('button', { name: es.common.save }));
    expect(await screen.findByText('Ya existe una tienda así.')).toBeTruthy();
    expect((screen.getByLabelText(es.store.name) as HTMLInputElement).value).toBe('Repetida');
  });
});
