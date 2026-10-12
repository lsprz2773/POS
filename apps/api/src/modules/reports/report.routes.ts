import type { FastifyPluginAsync } from 'fastify';
import type { Database } from '../../db/client';
import { authOf } from '../auth/plugin';
import type { Clock } from '../workdays/workday.usecases';
import { getDashboard, getReport } from './report.usecases';

/** Solo lectura: las cifras las calcula siempre el backend. */
export const reportRoutes: FastifyPluginAsync<{ db: Database; clock: Clock }> = async (
  app,
  { db, clock },
) => {
  app.addHook('preHandler', async (request) => app.authenticate(request));

  app.get('/dashboard', async (request) => getDashboard(db, authOf(request), clock));

  app.get('/reports', async (request) => getReport(db, authOf(request), request.query, clock));
};
