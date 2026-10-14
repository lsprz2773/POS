import type { Config } from './config';
import { createCognitoIdentityProvider } from './modules/auth/cognito-identity-provider';
import { createCognitoUserDirectory } from './modules/auth/cognito-user-directory';
import type { IdentityProvider, UserDirectory } from './modules/auth/identity-provider';
import { createLocalIdentity } from './modules/auth/local-identity-provider';

/**
 * Elige el proveedor de identidad y su administración de cuentas según la configuración:
 * local en desarrollo, Cognito en la nube.
 */
export function createIdentity(config: Config): {
  identity: IdentityProvider;
  directory: UserDirectory;
} {
  if (config.AUTH_PROVIDER === 'cognito') {
    return {
      identity: createCognitoIdentityProvider({
        region: config.COGNITO_REGION!,
        userPoolId: config.COGNITO_USER_POOL_ID!,
        clientId: config.COGNITO_CLIENT_ID!,
        refreshTtlSeconds: config.REFRESH_TTL_SECONDS,
      }),
      directory: createCognitoUserDirectory({
        region: config.COGNITO_REGION!,
        userPoolId: config.COGNITO_USER_POOL_ID!,
      }),
    };
  }
  const { provider, directory } = createLocalIdentity({
    secret: config.AUTH_SECRET!,
    usersJson: config.LOCAL_AUTH_USERS,
    accessTtlSeconds: config.ACCESS_TTL_SECONDS,
    refreshTtlSeconds: config.REFRESH_TTL_SECONDS,
  });
  return { identity: provider, directory };
}
