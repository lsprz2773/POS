import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { sql } from 'kysely';
import type { ApiErrorBody } from '@pos/shared';
import type { Config } from './config';
import type { Database } from './db/client';
import { AppError } from './errors';
import { authRoutes } from './modules/auth/auth.routes';
import type { IdentityProvider } from './modules/auth/identity-provider';
import { authPlugin } from './modules/auth/plugin';
import { productRoutes } from './modules/products/product.routes';
import { saleRoutes } from './modules/sales/sale.routes';
import { storeRoutes } from './modules/store/store.routes';
import { workdayRoutes } from './modules/workdays/workday.routes';
import { healthRoutes } from './routes/health';

export interface AppOptions {
  db: Database;
  identity: IdentityProvider;
  config: Pick<Config, 'APP_ORIGIN' | 'NODE_ENV'>;
  logger?: FastifyServerOptions['logger'];
  /** Reloj del servidor; las pruebas lo fijan para controlar "hoy". */
  clock?: () => Date;
  /** Para pruebas: sustituye la verificación de la base de datos. */
  checkDatabase?: () => Promise<void>;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Construye la aplicación sin escuchar un puerto, para poder probarla y usarla en Lambda. */
export function buildApp(options: AppOptions): FastifyInstance {
  const { db, identity, config } = options;
  const app = Fastify({
    logger: options.logger ?? false,
    requestIdHeader: 'x-request-id',
  });

  void app.register(cookie);

  // No hay CORS: la web y la API comparten origen. Una solicitud que modifica datos y llega
  // desde otro origen del navegador se rechaza (defensa adicional a SameSite=Strict).
  app.addHook('onRequest', async (request) => {
    const origin = request.headers.origin;
    if (!SAFE_METHODS.has(request.method) && origin && origin !== config.APP_ORIGIN) {
      throw new AppError(403, 'origin_not_allowed', 'Origen no permitido.');
    }
  });

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
    reply.header('x-content-type-options', 'nosniff');
    reply.header('cache-control', 'no-store');
  });

  // Nunca se exponen detalles internos al cliente (RNF-021).
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      const body: ApiErrorBody = { code: error.code, error: error.message, fields: error.fields };
      return reply.code(error.status).send(body);
    }
    const status =
      typeof error === 'object' && error !== null && 'statusCode' in error
        ? Number(error.statusCode)
        : 500;
    if (status >= 500 || Number.isNaN(status)) {
      request.log.error({ err: error }, 'Error interno');
      const body: ApiErrorBody = {
        code: 'internal_error',
        error: 'Error interno. Intenta de nuevo.',
      };
      return reply.code(500).send(body);
    }
    const body: ApiErrorBody = { code: 'validation_error', error: 'Solicitud inválida.' };
    return reply.code(status).send(body);
  });

  app.setNotFoundHandler((_request, reply) => {
    const body: ApiErrorBody = { code: 'not_found', error: 'No encontrado.' };
    return reply.code(404).send(body);
  });

  const checkDatabase =
    options.checkDatabase ??
    (async () => {
      await sql`select 1`.execute(db);
    });

  void app.register(authPlugin, { db, identity });
  void app.register(
    async (api) => {
      await api.register(healthRoutes, { checkDatabase });
      await api.register(authRoutes, {
        db,
        identity,
        cookies: { secure: config.NODE_ENV === 'production' },
      });
      await api.register(storeRoutes, { db });
      await api.register(productRoutes, { db });
      const clock = options.clock ?? (() => new Date());
      await api.register(workdayRoutes, { db, clock });
      await api.register(saleRoutes, { db, clock });
    },
    { prefix: '/api' },
  );

  return app;
}
