import type { FastifyPluginAsync } from 'fastify';
import type { Database } from '../../db/client';
import { authOf } from '../auth/plugin';
import { createProduct, getProduct, listProducts, updateProduct } from './product.usecases';

/** No hay DELETE: un producto se desactiva, nunca se borra (RF-024, RF-025). */
export const productRoutes: FastifyPluginAsync<{ db: Database }> = async (app, { db }) => {
  app.addHook('preHandler', async (request) => app.authenticate(request));

  app.get('/products', { config: { permission: 'product:read' } }, async (request) =>
    listProducts(db, authOf(request), request.query),
  );

  app.post('/products', { config: { permission: 'product:write' } }, async (request, reply) => {
    const product = await createProduct(db, authOf(request), request.body);
    return reply.code(201).send(product);
  });

  app.get<{ Params: { id: string } }>(
    '/products/:id',
    { config: { permission: 'product:read' } },
    async (request) => getProduct(db, authOf(request), request.params.id),
  );

  app.patch<{ Params: { id: string } }>(
    '/products/:id',
    { config: { permission: 'product:write' } },
    async (request) => updateProduct(db, authOf(request), request.params.id, request.body),
  );
};
