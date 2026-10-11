import type { FastifyPluginAsync } from 'fastify';
import type { Database } from '../../db/client';
import { authOf } from '../auth/plugin';
import type { Clock } from '../workdays/workday.usecases';
import { createSale, getSale } from './sale.usecases';

/** Las ventas no se editan ni se borran: aquí solo se crean y se consultan (fase 4). */
export const saleRoutes: FastifyPluginAsync<{ db: Database; clock: Clock }> = async (
  app,
  { db, clock },
) => {
  app.addHook('preHandler', async (request) => app.authenticate(request));

  /** Exige el encabezado `Idempotency-Key`. 201 si se creó; 200 si es un reintento ya atendido. */
  app.post('/sales', async (request, reply) => {
    const key = request.headers['idempotency-key'];
    const { sale, replayed } = await createSale(db, authOf(request), key, request.body, clock);
    if (replayed) reply.header('idempotent-replayed', 'true');
    return reply.code(replayed ? 200 : 201).send(sale);
  });

  app.get<{ Params: { id: string } }>('/sales/:id', async (request) =>
    getSale(db, authOf(request), request.params.id),
  );
};
