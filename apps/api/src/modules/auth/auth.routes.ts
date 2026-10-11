import type { FastifyPluginAsync } from 'fastify';
import { loginRequestSchema, type MeResponse } from '@pos/shared';
import type { Database } from '../../db/client';
import { AppError } from '../../errors';
import { parseInput } from '../../validation';
import { recordAudit } from '../audit/audit';
import { findAuthContext } from '../tenancy/context';
import {
  clearSessionCookies,
  REFRESH_COOKIE,
  setSessionCookies,
  type CookieSettings,
} from './cookies';
import {
  InvalidCredentialsError,
  InvalidTokenError,
  type IdentityProvider,
} from './identity-provider';
import { authOf } from './plugin';

export interface AuthRoutesOptions {
  db: Database;
  identity: IdentityProvider;
  cookies: CookieSettings;
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (app, options) => {
  const { db, identity, cookies } = options;

  app.post('/auth/login', async (request, reply) => {
    const { email, password } = parseInput(loginRequestSchema, request.body);
    try {
      const result = await identity.login(email, password);
      setSessionCookies(reply, result.tokens, cookies);

      const found = await findAuthContext(db, result.identity.subject);
      if (found?.tenantActive) {
        await recordAudit(db, {
          tenantId: found.context.tenantId,
          actorUserId: found.context.userId,
          entity: 'session',
          entityId: null,
          action: 'login',
        });
      }
      return { status: 'ok' };
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        request.log.warn('Inicio de sesión rechazado');
        // Mensaje genérico: no revela si falló el correo o la contraseña.
        throw new AppError(401, 'invalid_credentials', 'Correo o contraseña incorrectos.');
      }
      throw error;
    }
  });

  app.post('/auth/refresh', async (request, reply) => {
    const refreshToken = request.cookies[REFRESH_COOKIE];
    try {
      if (!refreshToken) throw new InvalidTokenError();
      const result = await identity.refresh(refreshToken);
      setSessionCookies(reply, result.tokens, cookies);
      return { status: 'ok' };
    } catch (error) {
      if (error instanceof InvalidTokenError) {
        clearSessionCookies(reply, cookies);
        throw new AppError(401, 'unauthenticated', 'Tu sesión expiró. Inicia sesión de nuevo.');
      }
      throw error;
    }
  });

  app.post('/auth/logout', async (_request, reply) => {
    clearSessionCookies(reply, cookies);
    return reply.code(204).send();
  });

  app.get('/me', { preHandler: async (request) => app.authenticate(request) }, async (request) => {
    const ctx = authOf(request);
    const body: MeResponse = {
      user: { id: ctx.userId, email: ctx.email },
      tenant: { id: ctx.tenantId, name: ctx.tenantName },
      role: ctx.role,
    };
    return body;
  });
};
