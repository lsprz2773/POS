import { createHash, timingSafeEqual } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import { sellerPasswordSchema } from '@pos/shared';
import {
  InvalidCredentialsError,
  InvalidTokenError,
  UserExistsError,
  WeakPasswordError,
  type AuthTokens,
  type Identity,
  type IdentityProvider,
  type UserDirectory,
} from './identity-provider';

const ISSUER = 'pos-local';
const usersSchema = z.array(z.object({ email: z.email(), password: z.string().min(1) }));

export interface LocalProviderOptions {
  secret: string;
  /** JSON con `[{ "email": "...", "password": "..." }]`. Solo para desarrollo y pruebas. */
  usersJson: string | undefined;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
}

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * Proveedor de identidad para desarrollo local, sin servicios externos ni dominio.
 * Emite JWT firmados con HS256. No se usa en producción (la configuración lo impide).
 */
export function createLocalIdentityProvider(options: LocalProviderOptions): IdentityProvider {
  return createLocalIdentity(options).provider;
}

/** El proveedor y su administración de cuentas comparten las mismas cuentas en memoria (solo desarrollo y pruebas). */
export function createLocalIdentity(options: LocalProviderOptions): {
  provider: IdentityProvider;
  directory: UserDirectory;
} {
  const key = new TextEncoder().encode(options.secret);
  const users = new Map<string, string>();
  const disabled = new Set<string>();
  if (options.usersJson) {
    for (const user of usersSchema.parse(JSON.parse(options.usersJson))) {
      users.set(user.email.toLowerCase(), user.password);
    }
  }

  const subjectOf = (email: string) => `local:${email}`;

  async function sign(identity: Identity, use: 'access' | 'refresh', ttl: number) {
    return new SignJWT({ email: identity.email, use })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(ISSUER)
      .setSubject(identity.subject)
      .setIssuedAt()
      .setExpirationTime(`${ttl}s`)
      .sign(key);
  }

  async function issue(identity: Identity): Promise<AuthTokens> {
    return {
      accessToken: await sign(identity, 'access', options.accessTtlSeconds),
      refreshToken: await sign(identity, 'refresh', options.refreshTtlSeconds),
      accessExpiresInSeconds: options.accessTtlSeconds,
      refreshExpiresInSeconds: options.refreshTtlSeconds,
    };
  }

  async function verify(token: string, use: 'access' | 'refresh'): Promise<Identity> {
    try {
      const { payload } = await jwtVerify(token, key, { issuer: ISSUER, algorithms: ['HS256'] });
      if (
        payload.use !== use ||
        typeof payload.sub !== 'string' ||
        typeof payload.email !== 'string'
      ) {
        throw new InvalidTokenError();
      }
      return { subject: payload.sub, email: payload.email };
    } catch {
      throw new InvalidTokenError();
    }
  }

  const provider: IdentityProvider = {
    async login(email, password) {
      const normalized = email.trim().toLowerCase();
      const expected = disabled.has(normalized) ? undefined : users.get(normalized);
      // Se compara siempre, aunque el usuario no exista, para no revelar su existencia por tiempo.
      const matches = timingSafeEqual(digest(password), digest(expected ?? '\u0000no-user'));
      if (!expected || !matches) throw new InvalidCredentialsError();
      const identity = { subject: subjectOf(normalized), email: normalized };
      return { identity, tokens: await issue(identity) };
    },

    verifyAccessToken: (token) => verify(token, 'access'),

    async refresh(refreshToken) {
      const identity = await verify(refreshToken, 'refresh');
      if (!users.has(identity.email) || disabled.has(identity.email)) throw new InvalidTokenError();
      return { identity, tokens: await issue(identity) };
    },
  };

  const emailOf = (subject: string) => subject.replace(/^local:/, '');

  const directory: UserDirectory = {
    async createUser(email, password) {
      const normalized = email.trim().toLowerCase();
      if (users.has(normalized)) throw new UserExistsError();
      if (!sellerPasswordSchema.safeParse(password).success) throw new WeakPasswordError();
      users.set(normalized, password);
      return { subject: subjectOf(normalized) };
    },
    async disable(subject) {
      disabled.add(emailOf(subject));
    },
    async enable(subject) {
      disabled.delete(emailOf(subject));
    },
    async signOutEverywhere() {},
    async deleteUser(subject) {
      users.delete(emailOf(subject));
      disabled.delete(emailOf(subject));
    },
  };

  return { provider, directory };
}
