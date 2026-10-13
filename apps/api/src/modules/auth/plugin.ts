import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { Database } from '../../db/client';
import { unauthenticated } from '../../errors';
import { requireAuthContext, type AuthContext } from '../tenancy/context';
import { readAccessToken } from './cookies';
import { InvalidTokenError, type IdentityProvider } from './identity-provider';

declare module 'fastify' {
  interface FastifyRequest {
    /** Presente solo en rutas protegidas con `app.authenticate`. */
    auth?: AuthContext;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
  }
}

export interface AuthPluginOptions {
  db: Database;
  identity: IdentityProvider;
}

/**
 * Autenticación y contexto de tienda. El tenant se obtiene únicamente de la identidad verificada;
 * ningún dato enviado por el cliente (cuerpo, parámetros o cabeceras) puede cambiarlo.
 */
export const authPlugin = fp<AuthPluginOptions>(async (app: FastifyInstance, options) => {
  app.decorateRequest('auth', undefined);
  app.decorate('authenticate', async (request: FastifyRequest) => {
    const token = readAccessToken(request);
    if (!token) throw unauthenticated();
    let subject: string;
    try {
      subject = (await options.identity.verifyAccessToken(token)).subject;
    } catch (error) {
      if (error instanceof InvalidTokenError) throw unauthenticated();
      throw error;
    }
    request.auth = await requireAuthContext(options.db, subject);
  });
});

/** Contexto de la solicitud; falla si la ruta no pasó por `authenticate`. */
export function authOf(request: FastifyRequest): AuthContext {
  if (!request.auth) throw unauthenticated();
  return request.auth;
}
