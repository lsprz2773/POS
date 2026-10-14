import type { FastifyPluginAsync } from 'fastify';
import type { Database } from '../../db/client';
import { authOf } from '../auth/plugin';
import {
  addOffer,
  adjustOffer,
  getWorkday,
  listWorkdays,
  removeOffer,
  updateWorkdayHours,
  type Clock,
} from './workday.usecases';

interface DateParams {
  date: string;
}
interface OfferParams extends DateParams {
  offerId: string;
}

/** `:date` es AAAA-MM-DD o `today` (el día de hoy en la zona horaria de la tienda). */
export const workdayRoutes: FastifyPluginAsync<{ db: Database; clock: Clock }> = async (
  app,
  { db, clock },
) => {
  app.addHook('preHandler', async (request) => app.authenticate(request));

  app.get('/workdays', { config: { permission: 'workday:read' } }, async (request) =>
    listWorkdays(db, authOf(request), request.query),
  );

  app.get<{ Params: DateParams }>(
    '/workdays/:date',
    { config: { permission: 'workday:read' } },
    async (request) => getWorkday(db, authOf(request), request.params.date, request.query, clock),
  );

  app.patch<{ Params: DateParams }>(
    '/workdays/:date',
    { config: { permission: 'workday:hours' } },
    async (request) =>
      updateWorkdayHours(db, authOf(request), request.params.date, request.body, clock),
  );

  app.post<{ Params: DateParams }>(
    '/workdays/:date/offers',
    { config: { permission: 'workday:prepare' } },
    async (request, reply) => {
      const workday = await addOffer(db, authOf(request), request.params.date, request.body, clock);
      return reply.code(201).send(workday);
    },
  );

  app.delete<{ Params: OfferParams }>(
    '/workdays/:date/offers/:offerId',
    { config: { permission: 'workday:prepare' } },
    async (request) =>
      removeOffer(db, authOf(request), request.params.date, request.params.offerId, clock),
  );

  app.post<{ Params: OfferParams }>(
    '/workdays/:date/offers/:offerId/adjustments',
    { config: { permission: 'workday:prepare' } },
    async (request, reply) => {
      const workday = await adjustOffer(
        db,
        authOf(request),
        request.params.date,
        request.params.offerId,
        request.body,
        clock,
      );
      return reply.code(201).send(workday);
    },
  );
};
