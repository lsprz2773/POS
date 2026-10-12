import type { FastifyPluginAsync } from 'fastify';
import type { Database } from '../../db/client';
import { authOf } from '../auth/plugin';
import type { Clock } from '../workdays/workday.usecases';
import { listPending, registerPayments, voidPayment } from './payment.usecases';
import { createSale, getSale } from './sale.usecases';

/** Las ventas y los pagos no se editan ni se borran: se crean, se consultan y se anulan o cancelan. */
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

  /** Ventas con saldo pendiente de cualquier día. Debe ir antes de `/sales/:id`. */
  app.get('/sales/pending', async (request) => listPending(db, authOf(request), request.query));

  app.get<{ Params: { id: string } }>('/sales/:id', async (request) =>
    getSale(db, authOf(request), request.params.id),
  );

  /** Registra un pago (efectivo, transferencia o mixto). Exige `Idempotency-Key`. */
  app.post<{ Params: { id: string } }>('/sales/:id/payments', async (request, reply) => {
    const key = request.headers['idempotency-key'];
    const { sale, replayed } = await registerPayments(
      db,
      authOf(request),
      request.params.id,
      key,
      request.body,
      clock,
    );
    if (replayed) reply.header('idempotent-replayed', 'true');
    return reply.code(replayed ? 200 : 201).send(sale);
  });

  /** Anula un pago con motivo. Devuelve la venta actualizada. */
  app.post<{ Params: { id: string } }>('/payments/:id/void', async (request) =>
    voidPayment(db, authOf(request), request.params.id, request.body, clock),
  );
};
