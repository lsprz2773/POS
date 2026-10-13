import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ME, STORE, apiError, renderApp, stubApi } from '../../test/helpers';
import { settingsChanges, validateSettings } from './settingsForm';

afterEach(() => vi.unstubAllGlobals());

const user = userEvent.setup();
const base = { 'GET /me': { body: ME }, 'GET /store': { body: STORE } };

describe('lógica del formulario de tienda', () => {
  it('valida con el mismo esquema del servidor', () => {
    expect(validateSettings(STORE as never)).toMatchObject({ ok: true });
    expect(validateSettings({ ...STORE, workdayEnd: '07:00' } as never)).toMatchObject({
      ok: false,
      errors: { workdayEnd: 'La hora de fin debe ser posterior a la de inicio.' },
    });
    expect(validateSettings({ ...STORE, operatingDays: [] } as never)).toMatchObject({
      ok: false,
      errors: { operatingDays: 'Elige al menos un día.' },
    });
    expect(validateSettings({ ...STORE, name: '  ' } as never)).toMatchObject({
      ok: false,
      errors: { name: 'Escribe el nombre de la tienda.' },
    });
  });

  it('solo envía lo que cambió', () => {
    expect(
      settingsChanges(
        STORE as never,
        { ...STORE, workdayStart: '09:00', operatingDays: [1, 2, 3, 4, 5, 6] } as never,
      ),
    ).toEqual({ workdayStart: '09:00', operatingDays: [1, 2, 3, 4, 5, 6] });
    expect(settingsChanges(STORE as never, STORE as never)).toEqual({});
  });
});

describe('configuración de la tienda', () => {
  it('muestra los valores guardados y los días de operación', async () => {
    stubApi(base);
    renderApp('/configuracion');
    expect(await screen.findByLabelText('Nombre de la tienda *')).toHaveValue('Tamales Ana');
    expect(screen.getByLabelText('Zona horaria')).toHaveDisplayValue('Ciudad de México');
    expect(screen.getByLabelText('Moneda')).toHaveDisplayValue('MXN · peso mexicano');
    expect(screen.getByLabelText('Inicio de jornada')).toHaveValue('08:00');
    expect(screen.getByLabelText('Fin de jornada')).toHaveValue('16:00');
    const days = screen.getByRole('group', { name: 'Días de operación' });
    for (const name of ['lunes', 'martes', 'miércoles', 'jueves', 'viernes']) {
      expect(within(days).getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true');
    }
    for (const name of ['sábado', 'domingo']) {
      expect(within(days).getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
    }
    expect(screen.getByText(/El horario es informativo/)).toBeInTheDocument();
  });

  it('guarda solo el cambio, avisa y vuelve a Más', async () => {
    const { calls } = stubApi({
      ...base,
      'PATCH /store': { body: { ...STORE, operatingDays: [1, 2, 3, 4, 5, 6] } },
    });
    renderApp('/configuracion');
    await user.click(await screen.findByRole('button', { name: 'sábado' }));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Más' })).toBeInTheDocument();
    expect(calls.find((c) => c.key === 'PATCH /store')!.body).toEqual({
      operatingDays: [1, 2, 3, 4, 5, 6],
    });
  });

  it('un horario inválido se marca en su campo y no llama al servidor', async () => {
    const { calls } = stubApi(base);
    renderApp('/configuracion');
    const end = await screen.findByLabelText('Fin de jornada');
    await user.clear(end);
    await user.type(end, '07:00');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(screen.getByLabelText('Fin de jornada')).toHaveAccessibleDescription(
      'La hora de fin debe ser posterior a la de inicio.',
    );
    expect(screen.getByLabelText('Fin de jornada')).toHaveFocus();
    expect(calls.some((c) => c.key === 'PATCH /store')).toBe(false);
  });

  it('exige al menos un día de operación', async () => {
    stubApi(base);
    renderApp('/configuracion');
    const days = await screen.findByRole('group', { name: 'Días de operación' });
    for (const name of ['lunes', 'martes', 'miércoles', 'jueves', 'viernes']) {
      await user.click(within(days).getByRole('button', { name }));
    }
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Elige al menos un día.')).toBeInTheDocument();
  });

  it('sin cambios no llama al servidor y lo dice', async () => {
    const { calls } = stubApi(base);
    renderApp('/configuracion');
    await user.click(await screen.findByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('No hay cambios por guardar.')).toBeInTheDocument();
    expect(calls.some((c) => c.key === 'PATCH /store')).toBe(false);
  });

  it('si el servidor rechaza un campo, lo marca ahí y conserva lo escrito', async () => {
    stubApi({
      ...base,
      'PATCH /store': {
        status: 400,
        body: {
          code: 'validation_error',
          error: 'Revisa los datos ingresados.',
          fields: { name: 'Máximo 100 caracteres.' },
        },
      },
    });
    renderApp('/configuracion');
    const name = await screen.findByLabelText('Nombre de la tienda *');
    await user.clear(name);
    await user.type(name, 'Nueva tienda');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByLabelText('Nombre de la tienda *')).toHaveAccessibleDescription(
      'Máximo 100 caracteres.',
    );
    expect(screen.getByLabelText('Nombre de la tienda *')).toHaveValue('Nueva tienda');
  });

  it('si falla la carga ofrece reintentar', async () => {
    let attempts = 0;
    stubApi({
      'GET /me': { body: ME },
      'GET /store': () =>
        ++attempts === 1 ? apiError(500, 'internal_error', 'x') : { body: STORE },
    });
    renderApp('/configuracion');
    expect(await screen.findByRole('alert')).toHaveTextContent('req-123');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByLabelText('Nombre de la tienda *')).toBeInTheDocument();
  });

  it('con cambios sin guardar pregunta antes de salir', async () => {
    stubApi(base);
    renderApp('/configuracion');
    await user.click(await screen.findByRole('button', { name: 'sábado' }));
    await user.click(screen.getByRole('link', { name: 'Volver a Más' }));
    expect(
      await screen.findByRole('alertdialog', { name: '¿Salir sin guardar?' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Descartar cambios' }));
    expect(await screen.findByRole('heading', { name: 'Más' })).toBeInTheDocument();
  });
});
