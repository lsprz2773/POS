import type { Config } from './config';
import { createCognitoIdentityProvider } from './modules/auth/cognito-identity-provider';
import type { IdentityProvider } from './modules/auth/identity-provider';
import { createLocalIdentityProvider } from './modules/auth/local-identity-provider';

/** Elige el proveedor de identidad según la configuración: local en desarrollo, Cognito en la nube. */
export function createIdentityProvider(config: Config): IdentityProvider {
  if (config.AUTH_PROVIDER === 'cognito') {
    return createCognitoIdentityProvider({
      region: config.COGNITO_REGION!,
      userPoolId: config.COGNITO_USER_POOL_ID!,
      clientId: config.COGNITO_CLIENT_ID!,
      refreshTtlSeconds: config.REFRESH_TTL_SECONDS,
    });
  }
  return createLocalIdentityProvider({
    secret: config.AUTH_SECRET!,
    usersJson: config.LOCAL_AUTH_USERS,
    accessTtlSeconds: config.ACCESS_TTL_SECONDS,
    refreshTtlSeconds: config.REFRESH_TTL_SECONDS,
  });
}
