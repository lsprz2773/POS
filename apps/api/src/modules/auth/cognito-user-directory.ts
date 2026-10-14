import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminSetUserPasswordCommand,
  AdminUserGlobalSignOutCommand,
  CognitoIdentityProviderClient,
  type AdminCreateUserCommandOutput,
} from '@aws-sdk/client-cognito-identity-provider';
import { UserExistsError, WeakPasswordError, type UserDirectory } from './identity-provider';

type AdminCommand =
  | AdminCreateUserCommand
  | AdminDeleteUserCommand
  | AdminDisableUserCommand
  | AdminEnableUserCommand
  | AdminSetUserPasswordCommand
  | AdminUserGlobalSignOutCommand;

/** Lo único que se usa del cliente de Cognito; las pruebas lo sustituyen. */
export interface CognitoAdminSender {
  send(command: AdminCommand): Promise<unknown>;
}

export interface CognitoDirectoryOptions {
  region: string;
  userPoolId: string;
  client?: CognitoAdminSender;
}

const nameOf = (error: unknown) =>
  typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';

/**
 * Alta, baja y cierre de sesión de cuentas en el grupo de usuarios (fase 10c, T107). Con el correo como
 * nombre de usuario, la cuenta recibe un identificador `sub` que también es su nombre interno; las demás
 * operaciones lo usan. La Lambda solo tiene permiso para estas acciones sobre este grupo (T110).
 */
export function createCognitoUserDirectory(options: CognitoDirectoryOptions): UserDirectory {
  const client: CognitoAdminSender =
    options.client ?? new CognitoIdentityProviderClient({ region: options.region });
  const UserPoolId = options.userPoolId;

  const removeQuietly = async (subject: string) => {
    try {
      await client.send(new AdminDeleteUserCommand({ UserPoolId, Username: subject }));
    } catch {
      // Si no se pudo deshacer, queda una cuenta sin tienda: no entra y se limpia a mano (manual de despliegue).
    }
  };

  return {
    async createUser(email, password) {
      let created: AdminCreateUserCommandOutput;
      try {
        created = (await client.send(
          new AdminCreateUserCommand({
            UserPoolId,
            Username: email,
            UserAttributes: [
              { Name: 'email', Value: email },
              { Name: 'email_verified', Value: 'true' },
            ],
            // Sin correo de invitación: el propietario entrega la contraseña (T108).
            MessageAction: 'SUPPRESS',
          }),
        )) as AdminCreateUserCommandOutput;
      } catch (error) {
        if (nameOf(error) === 'UsernameExistsException') throw new UserExistsError();
        // Cognito valida la política también aquí cuando no se envía contraseña temporal.
        throw error;
      }
      const subject = created.User?.Attributes?.find(
        (attribute) => attribute.Name === 'sub',
      )?.Value;
      if (!subject) {
        throw new Error('Cognito no devolvió el identificador de la cuenta creada.');
      }

      try {
        await client.send(
          new AdminSetUserPasswordCommand({
            UserPoolId,
            Username: subject,
            Password: password,
            Permanent: true,
          }),
        );
      } catch (error) {
        await removeQuietly(subject);
        if (nameOf(error) === 'InvalidPasswordException') throw new WeakPasswordError();
        throw error;
      }
      return { subject };
    },

    async disable(subject) {
      await client.send(new AdminDisableUserCommand({ UserPoolId, Username: subject }));
    },

    async enable(subject) {
      await client.send(new AdminEnableUserCommand({ UserPoolId, Username: subject }));
    },

    async signOutEverywhere(subject) {
      await client.send(new AdminUserGlobalSignOutCommand({ UserPoolId, Username: subject }));
    },

    async deleteUser(subject) {
      await client.send(new AdminDeleteUserCommand({ UserPoolId, Username: subject }));
    },
  };
}
