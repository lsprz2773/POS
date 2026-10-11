import type { FastifyPluginAsync } from 'fastify';
import type { Database } from '../../db/client';
import { authOf } from '../auth/plugin';
import { getStore, updateStore } from './store.usecases';

export const storeRoutes: FastifyPluginAsync<{ db: Database }> = async (app, { db }) => {
  app.addHook('preHandler', async (request) => app.authenticate(request));

  app.get('/store', async (request) => getStore(db, authOf(request)));

  app.patch('/store', async (request) => updateStore(db, authOf(request), request.body));
};
