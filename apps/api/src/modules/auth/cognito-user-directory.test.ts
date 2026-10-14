import { describe, expect, it } from 'vitest';
import { createCognitoUserDirectory, type CognitoAdminSender } from './cognito-user-directory';
import { UserExistsError, WeakPasswordError } from './identity-provider';

const POOL = 'us-east-2_Prueba';
const named = (name: string) => Object.assign(new Error(name), { name });

/** Registra cada comando enviado (su tipo y sus datos) y responde con lo que decida la prueba. */
function recorder(respond: (type: string, input: Record<string, unknown>) => unknown) {
  const calls: { type: string; input: Record<string, unknown> }[] = [];
  const client: CognitoAdminSender = {
    async send(command) {
      const type = command.constructor.name;
      const input = command.input as unknown as Record<string, unknown>;
      calls.push({ type, input });
      return respond(type, input);
    },
  };
  return {
    calls,
    directory: createCognitoUserDirectory({ region: 'us-east-2', userPoolId: POOL, client }),
  };
}

const created = { User: { Attributes: [{ Name: 'sub', Value: 'sub-vendedor' }] } };

describe('administración de cuentas con Cognito', () => {
  it('crea la cuenta sin invitación y le fija la contraseña definitiva', async () => {
    const { calls, directory } = recorder((type) =>
      type === 'AdminCreateUserCommand' ? created : {},
    );
    const password = 'Contrasena-Larga-1';
    const result = await directory.createUser('vera@tienda.test', password);

    expect(result).toEqual({ subject: 'sub-vendedor' });
    expect(calls.map((call) => call.type)).toEqual([
      'AdminCreateUserCommand',
      'AdminSetUserPasswordCommand',
    ]);
    expect(calls[0]!.input).toMatchObject({
      UserPoolId: POOL,
      Username: 'vera@tienda.test',
      MessageAction: 'SUPPRESS',
      UserAttributes: [
        { Name: 'email', Value: 'vera@tienda.test' },
        { Name: 'email_verified', Value: 'true' },
      ],
    });
    expect(calls[1]!.input).toMatchObject({
      UserPoolId: POOL,
      Username: 'sub-vendedor',
      Password: password,
      Permanent: true,
    });
  });

  it('un correo que ya existe en el grupo se reporta como cuenta existente', async () => {
    const { directory } = recorder(() => {
      throw named('UsernameExistsException');
    });
    await expect(directory.createUser('vera@tienda.test', 'x')).rejects.toBeInstanceOf(
      UserExistsError,
    );
  });

  it('si Cognito rechaza la contraseña, borra la cuenta recién creada', async () => {
    const { calls, directory } = recorder((type) => {
      if (type === 'AdminCreateUserCommand') return created;
      if (type === 'AdminSetUserPasswordCommand') throw named('InvalidPasswordException');
      return {};
    });
    await expect(directory.createUser('vera@tienda.test', 'x')).rejects.toBeInstanceOf(
      WeakPasswordError,
    );
    expect(calls.at(-1)).toMatchObject({
      type: 'AdminDeleteUserCommand',
      input: { UserPoolId: POOL, Username: 'sub-vendedor' },
    });
  });

  it('un error inesperado al fijar la contraseña también borra la cuenta y se propaga', async () => {
    const { calls, directory } = recorder((type) => {
      if (type === 'AdminCreateUserCommand') return created;
      if (type === 'AdminSetUserPasswordCommand') throw named('InternalErrorException');
      return {};
    });
    await expect(directory.createUser('vera@tienda.test', 'x')).rejects.toThrow(
      'InternalErrorException',
    );
    expect(calls.at(-1)!.type).toBe('AdminDeleteUserCommand');
  });

  it('falla si Cognito no devuelve el identificador de la cuenta', async () => {
    const { directory } = recorder(() => ({ User: { Attributes: [] } }));
    await expect(directory.createUser('vera@tienda.test', 'x')).rejects.toThrow(/identificador/);
  });

  it('deshabilita, habilita, cierra sesiones y borra por identificador', async () => {
    const { calls, directory } = recorder(() => ({}));
    await directory.disable('sub-1');
    await directory.enable('sub-1');
    await directory.signOutEverywhere('sub-1');
    await directory.deleteUser('sub-1');
    expect(calls).toEqual([
      { type: 'AdminDisableUserCommand', input: { UserPoolId: POOL, Username: 'sub-1' } },
      { type: 'AdminEnableUserCommand', input: { UserPoolId: POOL, Username: 'sub-1' } },
      { type: 'AdminUserGlobalSignOutCommand', input: { UserPoolId: POOL, Username: 'sub-1' } },
      { type: 'AdminDeleteUserCommand', input: { UserPoolId: POOL, Username: 'sub-1' } },
    ]);
  });
});
