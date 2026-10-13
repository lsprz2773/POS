import { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { createCognitoIdentityProvider, type CognitoSender } from './cognito-identity-provider';
import { InvalidCredentialsError, InvalidTokenError } from './identity-provider';

const REGION = 'us-east-1';
const POOL = 'us-east-1_Prueba';
const CLIENT = 'cliente-de-prueba';
const ISSUER = `https://cognito-idp.${REGION}.amazonaws.com/${POOL}`;

let privateKey: CryptoKey;
let keys: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), alg: 'RS256' }] });
});

const sign = (claims: Record<string, unknown>, issuer = ISSUER) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(issuer)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);

const accessToken = (claims: Record<string, unknown> = {}) =>
  sign({ sub: 'sub-1', token_use: 'access', client_id: CLIENT, ...claims });

function provider(send: CognitoSender['send']) {
  return createCognitoIdentityProvider({
    region: REGION,
    userPoolId: POOL,
    clientId: CLIENT,
    refreshTtlSeconds: 604_800,
    client: { send },
    keys,
  });
}

const named = (name: string) => Object.assign(new Error(name), { name });

describe('proveedor de identidad con Cognito', () => {
  it('inicia sesión y devuelve la identidad del token de identidad', async () => {
    const idToken = await sign({ sub: 'sub-1', email: 'Ana@Tienda.test', token_use: 'id' });
    const calls: unknown[] = [];
    const result = await provider(async (command) => {
      calls.push(command.input);
      return {
        AuthenticationResult: {
          AccessToken: 'acceso',
          RefreshToken: 'renovacion',
          IdToken: idToken,
          ExpiresIn: 900,
        },
      };
    }).login(' ana@tienda.test ', 'x');
    expect(result.identity).toEqual({ subject: 'sub-1', email: 'ana@tienda.test' });
    expect(result.tokens).toEqual({
      accessToken: 'acceso',
      refreshToken: 'renovacion',
      accessExpiresInSeconds: 900,
      refreshExpiresInSeconds: 604_800,
    });
    expect(calls[0]).toMatchObject({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: CLIENT,
      AuthParameters: { USERNAME: 'ana@tienda.test', PASSWORD: 'x' },
    });
  });

  it.each(['NotAuthorizedException', 'UserNotFoundException', 'UserNotConfirmedException'])(
    'rechaza credenciales con %s sin distinguir el motivo',
    async (name) => {
      await expect(
        provider(async () => {
          throw named(name);
        }).login('a@b.test', 'x'),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    },
  );

  it('una cuenta con reto de contraseña temporal no inicia sesión', async () => {
    await expect(
      provider(async () => ({ ChallengeName: 'NEW_PASSWORD_REQUIRED' })).login('a@b.test', 'x'),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('un fallo del servicio no se disfraza de credenciales incorrectas', async () => {
    await expect(
      provider(async () => {
        throw named('InternalErrorException');
      }).login('a@b.test', 'x'),
    ).rejects.toThrow('InternalErrorException');
  });

  it('verifica el token de acceso y devuelve el sujeto', async () => {
    const result = await provider(async () => ({})).verifyAccessToken(await accessToken());
    expect(result.subject).toBe('sub-1');
  });

  it.each([
    ['de identidad', { token_use: 'id' }],
    ['de otro cliente', { client_id: 'otro' }],
    ['sin sujeto', { sub: undefined }],
  ])('rechaza un token %s', async (_label, claims) => {
    await expect(
      provider(async () => ({})).verifyAccessToken(await accessToken(claims)),
    ).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('rechaza un token de otro emisor, vencido o basura', async () => {
    const p = provider(async () => ({}));
    const foreign = await sign(
      { sub: 's', token_use: 'access', client_id: CLIENT },
      'https://cognito-idp.us-east-1.amazonaws.com/otro',
    );
    await expect(p.verifyAccessToken(foreign)).rejects.toBeInstanceOf(InvalidTokenError);
    const expired = await new SignJWT({ sub: 's', token_use: 'access', client_id: CLIENT })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(ISSUER)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(privateKey);
    await expect(p.verifyAccessToken(expired)).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(p.verifyAccessToken('basura')).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('renueva la sesión conservando el token de renovación', async () => {
    const idToken = await sign({ sub: 'sub-1', email: 'ana@tienda.test', token_use: 'id' });
    const result = await provider(async (command) => {
      expect(command.input).toMatchObject({
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        AuthParameters: { REFRESH_TOKEN: 'renovacion' },
      });
      return { AuthenticationResult: { AccessToken: 'nuevo', IdToken: idToken, ExpiresIn: 900 } };
    }).refresh('renovacion');
    expect(result.tokens.refreshToken).toBe('renovacion');
    expect(result.tokens.accessToken).toBe('nuevo');
    expect(result.identity.subject).toBe('sub-1');
  });

  it('un token de renovación revocado o vencido es un token inválido', async () => {
    await expect(
      provider(async () => {
        throw named('NotAuthorizedException');
      }).refresh('x'),
    ).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('al cerrar sesión revoca el token y no falla si Cognito no responde', async () => {
    const sent: unknown[] = [];
    await provider(async (command) => {
      sent.push(command.input);
      return {};
    }).revoke!('renovacion');
    expect(sent[0]).toEqual({ ClientId: CLIENT, Token: 'renovacion' });
    await expect(
      provider(async () => {
        throw named('InternalErrorException');
      }).revoke!('x'),
    ).resolves.toBeUndefined();
  });
});
