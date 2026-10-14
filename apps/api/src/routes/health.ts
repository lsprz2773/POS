import type { FastifyPluginAsync } from 'fastify';
import { type HealthResponse, type ReadyResponse } from '@pos/shared';

export interface HealthRoutesOptions {
  /** Verifica que la base de datos responde; debe lanzar si no está disponible. */
  checkDatabase: () => Promise<void>;
}

export const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = async (app, options) => {
  app.get('/health', { config: { public: true } }, async (): Promise<HealthResponse> => ({
    status: 'ok',
  }));

  app.get(
    '/health/ready',
    { config: { public: true } },
    async (request, reply): Promise<ReadyResponse> => {
      try {
        await options.checkDatabase();
        return { status: 'ok' };
      } catch (error) {
        request.log.error({ err: error }, 'La base de datos no está disponible');
        return reply.code(503).send({ status: 'unavailable' });
      }
    },
  );
};
