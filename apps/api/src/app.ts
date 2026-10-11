import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { healthRoutes, type HealthRoutesOptions } from './routes/health';

export interface AppOptions extends HealthRoutesOptions {
  logger?: FastifyServerOptions['logger'];
}

/** Construye la aplicación sin escuchar un puerto, para poder probarla y usarla en Lambda. */
export function buildApp(options: AppOptions): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? false,
    requestIdHeader: 'x-request-id',
  });

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  // Nunca se exponen detalles internos al cliente (RNF-021).
  app.setErrorHandler((error, request, reply) => {
    const status =
      typeof error === 'object' && error !== null && 'statusCode' in error
        ? Number(error.statusCode)
        : 500;
    if (status >= 500) {
      request.log.error({ err: error }, 'Error interno');
      return reply.code(500).send({ error: 'Error interno. Intenta de nuevo.' });
    }
    return reply.code(status).send({ error: 'Solicitud inválida.' });
  });

  void app.register(healthRoutes, {
    prefix: '/api',
    checkDatabase: options.checkDatabase,
  });

  return app;
}
