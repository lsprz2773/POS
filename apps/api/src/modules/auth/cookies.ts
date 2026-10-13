import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthTokens } from './identity-provider';

export const ACCESS_COOKIE = 'pos_access';
export const REFRESH_COOKIE = 'pos_refresh';
const REFRESH_PATH = '/api/auth';

export interface CookieSettings {
  secure: boolean;
}

/** Los tokens viajan en cookies HttpOnly: el código de la página no puede leerlos (D2). */
export function setSessionCookies(
  reply: FastifyReply,
  tokens: AuthTokens,
  settings: CookieSettings,
) {
  const base = { httpOnly: true, sameSite: 'strict', secure: settings.secure } as const;
  reply.setCookie(ACCESS_COOKIE, tokens.accessToken, {
    ...base,
    path: '/',
    maxAge: tokens.accessExpiresInSeconds,
  });
  reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base,
    path: REFRESH_PATH,
    maxAge: tokens.refreshExpiresInSeconds,
  });
}

export function clearSessionCookies(reply: FastifyReply, settings: CookieSettings) {
  const base = { httpOnly: true, sameSite: 'strict', secure: settings.secure } as const;
  reply.clearCookie(ACCESS_COOKIE, { ...base, path: '/' });
  reply.clearCookie(REFRESH_COOKIE, { ...base, path: REFRESH_PATH });
}

/** Token de acceso: cookie, o cabecera Bearer para herramientas y pruebas. */
export function readAccessToken(request: FastifyRequest): string | undefined {
  const cookie = request.cookies[ACCESS_COOKIE];
  if (cookie) return cookie;
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length).trim() || undefined;
  return undefined;
}
