import type { FastifyPluginAsync } from 'fastify';
import type { Database } from '../../db/client';
import { authOf } from '../auth/plugin';
import type { Clock } from '../workdays/workday.usecases';
import { getDashboard, getReport } from './report.usecases';
import { getSellerDetail, getSellersReport } from './team-report.usecases';

/** Solo lectura: las cifras las calcula siempre el backend. */
export const reportRoutes: FastifyPluginAsync<{ db: Database; clock: Clock }> = async (
  app,
  { db, clock },
) => {
  app.addHook('preHandler', async (request) => app.authenticate(request));

  app.get('/dashboard', { config: { permission: 'report:read' } }, async (request) =>
    getDashboard(db, authOf(request), clock),
  );

  app.get('/reports', { config: { permission: 'report:read' } }, async (request) =>
    getReport(db, authOf(request), request.query, clock),
  );

  /** Reportes del equipo (fase 10d): solo el propietario. Deben ir antes de cualquier ruta con comodín. */
  app.get('/reports/sellers', { config: { permission: 'team:report' } }, async (request) =>
    getSellersReport(db, authOf(request), request.query, clock),
  );

  app.get<{ Params: { userId: string } }>(
    '/reports/sellers/:userId',
    { config: { permission: 'team:report' } },
    async (request) =>
      getSellerDetail(db, authOf(request), request.params.userId, request.query, clock),
  );
};
