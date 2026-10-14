import type { FastifyPluginAsync } from 'fastify';
import type { Database } from '../../db/client';
import { authOf } from '../auth/plugin';
import type { UserDirectory } from '../auth/identity-provider';
import { createSeller, listTeam, updateSeller } from './team.usecases';

/** Equipo de la tienda (fase 10c): solo el propietario. No hay cambio de contraseña (T108). */
export const teamRoutes: FastifyPluginAsync<{ db: Database; directory: UserDirectory }> = async (
  app,
  { db, directory },
) => {
  app.addHook('preHandler', async (request) => app.authenticate(request));

  app.get('/team', { config: { permission: 'team:manage' } }, async (request) =>
    listTeam(db, authOf(request)),
  );

  app.post('/team/sellers', { config: { permission: 'team:manage' } }, async (request, reply) => {
    const member = await createSeller(db, authOf(request), directory, request.body);
    return reply.code(201).send(member);
  });

  app.patch<{ Params: { userId: string } }>(
    '/team/:userId',
    { config: { permission: 'team:manage' } },
    async (request) =>
      updateSeller(db, authOf(request), directory, request.params.userId, request.body),
  );
};
