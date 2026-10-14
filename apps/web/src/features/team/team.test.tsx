import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ME, STORE, apiError, makeMember, makeTeam, renderApp, stubApi } from '../../test/helpers';

afterEach(() => vi.unstubAllGlobals());

const base = { 'GET /me': { body: ME }, 'GET /store': { body: STORE } };
const PASSWORD = 'Contrasena-Larga-1';

const vera = makeMember();
const raul = makeMember({
  id: '90000000-0000-4000-8000-000000000002',
  email: 'raul@tienda.test',
  displayName: null,
  status: 'disabled',
});

describe('Equipo', () => {
  it('lista a las personas de la tienda con su estado y las acciones de cada vendedor', async () => {
    stubApi({ ...base, 'GET /team': makeTeam([vera, raul]) });
    renderApp('/equipo');
    expect(await screen.findByRole('heading', { name: 'Equipo' })).toBeInTheDocument();
    expect(await screen.findByText('1 de 10 vendedores activos')).toBeInTheDocument();

    const list = screen.getByRole('list', { name: 'Personas de tu tienda' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('ana@tienda.test');
    expect(items[0]).toHaveTextContent('Tú');
    expect(items[0]).toHaveTextContent('Propietario');
    expect(items[1]).toHaveTextContent('Vera López');
    expect(items[1]).toHaveTextContent('vera@tienda.test');
    expect(items[1]).toHaveTextContent('Activo');
    expect(within(items[1]!).getByRole('link', { name: 'Ver su día' })).toHaveAttribute(
      'href',
      `/dia/inventario?vendedor=${vera.id}`,
    );
    expect(within(items[1]!).getByRole('link', { name: 'Ver reporte' })).toHaveAttribute(
      'href',
      `/reportes/equipo/${vera.id}`,
    );
    expect(within(items[1]!).getByRole('button', { name: 'Dar de baja' })).toBeInTheDocument();
    expect(items[2]).toHaveTextContent('Dado de baja');
    expect(within(items[2]!).getByRole('button', { name: 'Reactivar' })).toBeInTheDocument();
  });

  it('sin vendedores explica cómo empezar y ofrece agregar al primero', async () => {
    stubApi({ ...base, 'GET /team': makeTeam([]) });
    renderApp('/equipo');
    expect(await screen.findByText('Aún no tienes vendedores')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Agregar vendedor/ }).length).toBeGreaterThan(0);
  });

  it('con el tope de vendedores avisa y no deja agregar más', async () => {
    stubApi({ ...base, 'GET /team': makeTeam([vera], 10) });
    renderApp('/equipo');
    expect(await screen.findByText(/Llegaste al límite de vendedores activos/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Agregar vendedor/ })).toBeDisabled();
  });

  it('da de alta a un vendedor con nombre, correo y contraseña', async () => {
    const created = makeMember({ displayName: 'Lucía', email: 'lucia@tienda.test' });
    const { calls } = stubApi({
      ...base,
      'GET /team': makeTeam([]),
      'POST /team/sellers': { status: 201, body: created },
    });
    const u = userEvent.setup();
    renderApp('/equipo');
    await screen.findByText('Aún no tienes vendedores');
    await u.click(screen.getAllByRole('button', { name: /Agregar vendedor/ })[0]!);

    const sheet = await screen.findByRole('dialog', { name: 'Agregar vendedor' });
    expect(within(sheet).getByLabelText('Contraseña')).toHaveAttribute('type', 'password');
    expect(within(sheet).getByText(/Mínimo 12 caracteres/)).toBeInTheDocument();
    await u.type(within(sheet).getByLabelText('Nombre'), 'Lucía');
    await u.type(within(sheet).getByLabelText('Correo'), 'Lucia@Tienda.test');
    await u.type(within(sheet).getByLabelText('Contraseña'), PASSWORD);
    await u.click(within(sheet).getByRole('button', { name: 'Crear vendedor' }));

    await waitFor(() =>
      expect(calls.find((c) => c.key === 'POST /team/sellers')?.body).toEqual({
        displayName: 'Lucía',
        email: 'lucia@tienda.test',
        password: PASSWORD,
      }),
    );
    expect(await screen.findByText('Lucía ya puede iniciar sesión.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Agregar vendedor' })).not.toBeInTheDocument();
  });

  it('dice qué corregir y no llama al servidor si los datos no son válidos', async () => {
    const { calls } = stubApi({ ...base, 'GET /team': makeTeam([vera]) });
    const u = userEvent.setup();
    renderApp('/equipo');
    await screen.findByText('1 de 10 vendedores activos');
    await u.click(screen.getByRole('button', { name: /Agregar vendedor/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Agregar vendedor' });
    await u.type(within(sheet).getByLabelText('Correo'), 'sin-arroba');
    await u.type(within(sheet).getByLabelText('Contraseña'), 'corta');
    await u.click(within(sheet).getByRole('button', { name: 'Crear vendedor' }));

    expect(await within(sheet).findByText('Escribe el nombre.')).toBeInTheDocument();
    expect(within(sheet).getByText('Escribe un correo válido.')).toBeInTheDocument();
    expect(within(sheet).getByText(/Usa al menos 12 caracteres/)).toBeInTheDocument();
    expect(within(sheet).getByText(/No se creó el vendedor/)).toBeInTheDocument();
    expect(calls.some((c) => c.key === 'POST /team/sellers')).toBe(false);
  });

  it('muestra el error del servidor junto al campo (correo repetido)', async () => {
    stubApi({
      ...base,
      'GET /team': makeTeam([vera]),
      'POST /team/sellers': {
        status: 409,
        body: {
          code: 'conflict',
          error: 'Ya existe una cuenta con ese correo.',
          fields: { email: 'Ya existe una cuenta con ese correo.' },
        },
      },
    });
    const u = userEvent.setup();
    renderApp('/equipo');
    await screen.findByText('1 de 10 vendedores activos');
    await u.click(screen.getByRole('button', { name: /Agregar vendedor/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Agregar vendedor' });
    await u.type(within(sheet).getByLabelText('Nombre'), 'Vera');
    await u.type(within(sheet).getByLabelText('Correo'), 'vera@tienda.test');
    await u.type(within(sheet).getByLabelText('Contraseña'), PASSWORD);
    await u.click(within(sheet).getByRole('button', { name: 'Crear vendedor' }));
    expect(
      await within(sheet).findByText('Ya existe una cuenta con ese correo.'),
    ).toBeInTheDocument();
    expect(within(sheet).getByLabelText('Correo')).toHaveAttribute('aria-invalid', 'true');
    // El formulario sigue abierto con lo escrito.
    expect(within(sheet).getByLabelText('Nombre')).toHaveValue('Vera');
  });

  it('dar de baja pide confirmación, con la salida segura enfocada', async () => {
    const { calls } = stubApi({
      ...base,
      'GET /team': makeTeam([vera]),
      'PATCH /team/90000000-0000-4000-8000-000000000001': {
        body: makeMember({ status: 'disabled' }),
      },
    });
    const u = userEvent.setup();
    renderApp('/equipo');
    await screen.findByText('1 de 10 vendedores activos');
    await u.click(screen.getByRole('button', { name: 'Dar de baja' }));

    const dialog = await screen.findByRole('alertdialog', { name: '¿Dar de baja a Vera López?' });
    expect(within(dialog).getByText(/Sus ventas y reportes se conservan/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Mantener activo' })).toHaveFocus();
    // Cancelar no cambia nada.
    await u.click(within(dialog).getByRole('button', { name: 'Mantener activo' }));
    expect(calls.some((c) => c.key.startsWith('PATCH'))).toBe(false);

    await u.click(screen.getByRole('button', { name: 'Dar de baja' }));
    await u.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Dar de baja' }),
    );
    await waitFor(() =>
      expect(calls.find((c) => c.key.startsWith('PATCH'))?.body).toEqual({ status: 'disabled' }),
    );
    expect(await screen.findByText('Vera López ya no puede entrar.')).toBeInTheDocument();
  });

  it('reactiva a un vendedor dado de baja', async () => {
    const { calls } = stubApi({
      ...base,
      'GET /team': makeTeam([vera, raul]),
      'PATCH /team/90000000-0000-4000-8000-000000000002': {
        body: makeMember({ status: 'active' }),
      },
    });
    const u = userEvent.setup();
    renderApp('/equipo');
    await screen.findByText('1 de 10 vendedores activos');
    await u.click(screen.getByRole('button', { name: 'Reactivar' }));
    await waitFor(() =>
      expect(calls.find((c) => c.key.startsWith('PATCH'))?.body).toEqual({ status: 'active' }),
    );
    expect(await screen.findByText(/raul@tienda.test volvió a estar activo/)).toBeInTheDocument();
  });

  it('un fallo del servidor al dar de baja se explica y no cambia la lista', async () => {
    stubApi({
      ...base,
      'GET /team': makeTeam([vera]),
      'PATCH /team/90000000-0000-4000-8000-000000000001': apiError(500, 'internal_error', 'x'),
    });
    const u = userEvent.setup();
    renderApp('/equipo');
    await screen.findByText('1 de 10 vendedores activos');
    await u.click(screen.getByRole('button', { name: 'Dar de baja' }));
    await u.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Dar de baja' }),
    );
    expect(await screen.findByText('Algo salió mal. Inténtalo de nuevo.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dar de baja' })).toBeInTheDocument();
  });
});
