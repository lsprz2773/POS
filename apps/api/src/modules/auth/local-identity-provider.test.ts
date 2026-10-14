import { randomBytes } from 'node:crypto';
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  TEST_SECRET,
  TEST_USERS,
  makeIdentity,
  makeLocalIdentity,
} from '../../../test/support/app';
import {
  InvalidCredentialsError,
  InvalidTokenError,
  UserExistsError,
  WeakPasswordError,
} from './identity-provider';

const [ana] = TEST_USERS;

async function forgeToken(claims: Record<string, unknown>, exp: number, secret = TEST_SECRET) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('pos-local')
    .setSubject(`local:${ana!.email}`)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(secret));
}

const future = () => Math.floor(Date.now() / 1000) + 600;
const past = () => Math.floor(Date.now() / 1000) - 600;

describe('proveedor de identidad local', () => {
  it('inicia sesión con credenciales válidas y devuelve tokens verificables', async () => {
    const provider = makeIdentity();
    const { identity, tokens } = await provider.login(ana!.email, ana!.password);
    expect(identity).toEqual({ subject: `local:${ana!.email}`, email: ana!.email });
    expect(await provider.verifyAccessToken(tokens.accessToken)).toEqual(identity);
  });

  it('ignora mayúsculas en el correo', async () => {
    const { identity } = await makeIdentity().login(ana!.email.toUpperCase(), ana!.password);
    expect(identity.email).toBe(ana!.email);
  });

  it('rechaza contraseña incorrecta y usuario inexistente con el mismo error', async () => {
    const provider = makeIdentity();
    await expect(provider.login(ana!.email, 'mala')).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
    await expect(provider.login('nadie@test.test', 'x')).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
  });

  it('rechaza un token vencido', async () => {
    const token = await forgeToken({ email: ana!.email, use: 'access' }, past());
    await expect(makeIdentity().verifyAccessToken(token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('rechaza un token firmado con otro secreto', async () => {
    const token = await forgeToken(
      { email: ana!.email, use: 'access' },
      future(),
      randomBytes(32).toString('hex'),
    );
    await expect(makeIdentity().verifyAccessToken(token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('no acepta un token de renovación como token de acceso ni al revés', async () => {
    const provider = makeIdentity();
    const { tokens } = await provider.login(ana!.email, ana!.password);
    await expect(provider.verifyAccessToken(tokens.refreshToken)).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
    await expect(provider.refresh(tokens.accessToken)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('renueva la sesión con un token de renovación válido', async () => {
    const provider = makeIdentity();
    const { tokens } = await provider.login(ana!.email, ana!.password);
    const renewed = await provider.refresh(tokens.refreshToken);
    expect((await provider.verifyAccessToken(renewed.tokens.accessToken)).email).toBe(ana!.email);
  });

  it('rechaza texto que no es un token', async () => {
    await expect(makeIdentity().verifyAccessToken('basura')).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
  });
});

describe('cuentas del proveedor local (equipo)', () => {
  const password = 'Contrasena-Larga-1';

  it('una cuenta creada puede iniciar sesión con la contraseña registrada', async () => {
    const { provider, directory } = makeLocalIdentity();
    const { subject } = await directory.createUser('Nueva@Tienda.test', password);
    expect(subject).toBe('local:nueva@tienda.test');
    const { identity } = await provider.login('nueva@tienda.test', password);
    expect(identity.subject).toBe(subject);
  });

  it('rechaza un correo repetido y una contraseña que no cumple la política', async () => {
    const { directory } = makeLocalIdentity();
    await expect(directory.createUser(ana!.email, password)).rejects.toBeInstanceOf(
      UserExistsError,
    );
    await expect(directory.createUser('x@tienda.test', 'corta')).rejects.toBeInstanceOf(
      WeakPasswordError,
    );
    await expect(directory.createUser('x@tienda.test', 'sinnumeroslargaaa')).rejects.toBeInstanceOf(
      WeakPasswordError,
    );
  });

  it('una cuenta deshabilitada no inicia sesión ni renueva, y al habilitarla vuelve', async () => {
    const { provider, directory } = makeLocalIdentity();
    const { subject } = await directory.createUser('baja@tienda.test', password);
    const { tokens } = await provider.login('baja@tienda.test', password);

    await directory.disable(subject);
    await expect(provider.login('baja@tienda.test', password)).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
    await expect(provider.refresh(tokens.refreshToken)).rejects.toBeInstanceOf(InvalidTokenError);

    await directory.enable(subject);
    await expect(provider.login('baja@tienda.test', password)).resolves.toBeDefined();
  });

  it('una cuenta borrada ya no existe', async () => {
    const { provider, directory } = makeLocalIdentity();
    const { subject } = await directory.createUser('borrar@tienda.test', password);
    await directory.deleteUser(subject);
    await expect(provider.login('borrar@tienda.test', password)).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
  });
});
