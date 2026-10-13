import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  RevokeTokenCommand,
  type InitiateAuthCommandOutput,
} from '@aws-sdk/client-cognito-identity-provider';
import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTVerifyGetKey } from 'jose';
import {
  InvalidCredentialsError,
  InvalidTokenError,
  type AuthTokens,
  type Identity,
  type IdentityProvider,
} from './identity-provider';

/** Lo único que se usa del cliente de Cognito; las pruebas lo sustituyen. */
export interface CognitoSender {
  send(command: InitiateAuthCommand | RevokeTokenCommand): Promise<unknown>;
}

export interface CognitoProviderOptions {
  region: string;
  userPoolId: string;
  /** Cliente de aplicación sin secreto, con USER_PASSWORD_AUTH y renovación habilitados. */
  clientId: string;
  /** Debe coincidir con la vigencia del token de renovación configurada en el grupo de usuarios. */
  refreshTtlSeconds: number;
  client?: CognitoSender;
  /** Claves públicas del grupo de usuarios; las pruebas pasan unas propias. */
  keys?: JWTVerifyGetKey;
}

// Errores de Cognito que equivalen a "credenciales o token no válidos"; el resto se propaga.
const REJECTED = new Set([
  'NotAuthorizedException',
  'UserNotFoundException',
  'UserNotConfirmedException',
  'PasswordResetRequiredException',
]);

const isRejection = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'name' in error &&
  REJECTED.has(String(error.name));

/**
 * Proveedor de identidad con Amazon Cognito (fase 9). El navegador nunca habla con Cognito: este
 * proveedor intercambia las credenciales en el servidor y las cookies `HttpOnly` llevan los tokens.
 */
export function createCognitoIdentityProvider(options: CognitoProviderOptions): IdentityProvider {
  const issuer = `https://cognito-idp.${options.region}.amazonaws.com/${options.userPoolId}`;
  const client: CognitoSender =
    options.client ?? new CognitoIdentityProviderClient({ region: options.region });
  const keys = options.keys ?? createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));

  const identityOf = (idToken: string | undefined, fallback?: Identity): Identity => {
    if (!idToken) {
      if (fallback) return fallback;
      throw new InvalidTokenError();
    }
    const claims = decodeJwt(idToken);
    if (typeof claims.sub !== 'string') throw new InvalidTokenError();
    return {
      subject: claims.sub,
      email: typeof claims.email === 'string' ? claims.email.toLowerCase() : '',
    };
  };

  const accessTtl = (result: InitiateAuthCommandOutput) =>
    result.AuthenticationResult?.ExpiresIn ?? 3600;

  return {
    async login(email, password) {
      let result: InitiateAuthCommandOutput;
      try {
        result = (await client.send(
          new InitiateAuthCommand({
            AuthFlow: 'USER_PASSWORD_AUTH',
            ClientId: options.clientId,
            AuthParameters: { USERNAME: email.trim(), PASSWORD: password },
          }),
        )) as InitiateAuthCommandOutput;
      } catch (error) {
        if (isRejection(error)) throw new InvalidCredentialsError();
        throw error;
      }
      const auth = result.AuthenticationResult;
      // Una cuenta con contraseña temporal pide cambiarla (reto): no inicia sesión aquí.
      if (!auth?.AccessToken || !auth.RefreshToken) throw new InvalidCredentialsError();
      return {
        identity: identityOf(auth.IdToken),
        tokens: {
          accessToken: auth.AccessToken,
          refreshToken: auth.RefreshToken,
          accessExpiresInSeconds: accessTtl(result),
          refreshExpiresInSeconds: options.refreshTtlSeconds,
        } satisfies AuthTokens,
      };
    },

    async verifyAccessToken(token) {
      try {
        const { payload } = await jwtVerify(token, keys, { issuer, algorithms: ['RS256'] });
        if (
          payload.token_use !== 'access' ||
          payload.client_id !== options.clientId ||
          typeof payload.sub !== 'string'
        ) {
          throw new InvalidTokenError();
        }
        // El token de acceso no lleva correo y nada depende de él: el correo vigente está en la base.
        return { subject: payload.sub, email: '' };
      } catch {
        throw new InvalidTokenError();
      }
    },

    async refresh(refreshToken) {
      let result: InitiateAuthCommandOutput;
      try {
        result = (await client.send(
          new InitiateAuthCommand({
            AuthFlow: 'REFRESH_TOKEN_AUTH',
            ClientId: options.clientId,
            AuthParameters: { REFRESH_TOKEN: refreshToken },
          }),
        )) as InitiateAuthCommandOutput;
      } catch (error) {
        if (isRejection(error)) throw new InvalidTokenError();
        throw error;
      }
      const auth = result.AuthenticationResult;
      if (!auth?.AccessToken) throw new InvalidTokenError();
      return {
        identity: identityOf(auth.IdToken),
        tokens: {
          accessToken: auth.AccessToken,
          // Cognito no rota el token de renovación: se conserva el mismo.
          refreshToken: auth.RefreshToken ?? refreshToken,
          accessExpiresInSeconds: accessTtl(result),
          refreshExpiresInSeconds: options.refreshTtlSeconds,
        },
      };
    },

    async revoke(refreshToken) {
      try {
        await client.send(
          new RevokeTokenCommand({ ClientId: options.clientId, Token: refreshToken }),
        );
      } catch {
        // Cerrar sesión nunca falla por esto: las cookies se borran de todos modos.
      }
    },
  };
}
