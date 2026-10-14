import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { Database } from '../../db/client';
import type { Permission } from '@pos/shared';
import { unauthenticated } from '../../errors';
import { requireAuthContext, type AuthContext } from '../tenancy/context';
import { assertCan } from '../tenancy/permissions';
import { readAccessToken } from './cookies';
import { InvalidTokenError, type IdentityProvider } from './identity-provider';

declare module 'fastify' {
  interface FastifyContextConfig {
    /**
     * Toda ruta declara una de dos cosas (T103): `public` (salud e inicio de sesión) o el permiso que
     * exige. `'any'` es para cualquier persona con sesión. Una ruta sin ninguna no deja arrancar la API.
     */
    permission?: Permission | 'any';
    public?: true;
  }
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

  // Falla cerrado: una ruta nueva sin permiso declarado no se puede poner en servicio.
  app.addHook('onRoute', (route) => {
    const config = (route.config ?? {}) as { permission?: unknown; public?: unknown };
    if (!config.public && !config.permission) {
      throw new Error(
        `La ruta ${String(route.method)} ${route.url} no declara su permiso (config.permission) ni es pública.`,
      );
    }
  });

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
    const permission = request.routeOptions.config.permission;
    if (permission && permission !== 'any') assertCan(request.auth, permission);
  });
});

/** Contexto de la solicitud; falla si la ruta no pasó por `authenticate`. */
export function authOf(request: FastifyRequest): AuthContext {
  if (!request.auth) throw unauthenticated();
  return request.auth;
}
