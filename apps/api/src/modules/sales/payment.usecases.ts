import {
  balanceOf,
  collectionStatus,
  formatFolio,
  idempotencyKeySchema,
  listPendingQuerySchema,
  registerPaymentSchema,
  toCents,
  voidPaymentSchema,
  type PendingList,
  type Sale,
} from '@pos/shared';
import { z } from 'zod';
import type { Database } from '../../db/client';
import { AppError } from '../../errors';
import { parseInput } from '../../validation';
import { recordAudit } from '../audit/audit';
import { createStoreRepository } from '../store/store.repository';
import type { AuthContext } from '../tenancy/context';
import type { Clock } from '../workdays/workday.usecases';
import { applyPayments } from './payment.apply';
import { hashPaymentRequest } from './sale.domain';
import { createSaleRepository } from './sale.repository';
import { getSale, KEY_REUSED } from './sale.usecases';

const SALE_NOT_FOUND = () => new AppError(404, 'not_found', 'Esa venta ya no está disponible.');
const PAYMENT_NOT_FOUND = () => new AppError(404, 'not_found', 'Ese pago ya no está disponible.');
const SALE_CANCELLED = (what: string) =>
  new AppError(409, 'conflict', `Esta venta está cancelada: ya no admite ${what}.`);

const uuid = z.uuid();

export interface RegisterPaymentResult {
  sale: Sale;
  /** Verdadero si la llave ya había registrado este pago y solo se devuelve el resultado original. */
  replayed: boolean;
}

/**
 * Registra un pago (efectivo, transferencia o mixto) sobre una venta pendiente (RF-059). Bloquea la
 * venta para que los pagos simultáneos se registren de uno en uno y nunca sumen de más.
 * La llave de idempotencia evita duplicar el pago si la red falla y se reintenta (RF-062).
 */
export async function registerPayments(
  db: Database,
  ctx: AuthContext,
  saleIdParam: string,
  rawKey: unknown,
  input: unknown,
  clock: Clock,
): Promise<RegisterPaymentResult> {
  const parsedId = uuid.safeParse(saleIdParam);
  if (!parsedId.success) throw SALE_NOT_FOUND();
  const saleId = parsedId.data;
  const { idempotencyKey } = parseInput(z.object({ idempotencyKey: idempotencyKeySchema }), {
    idempotencyKey: rawKey,
  });
  const { lines } = parseInput(registerPaymentSchema, input);
  const requestHash = hashPaymentRequest(saleId, lines);

  const earlierSale = async (executor: Database): Promise<string | undefined> => {
    const existing = await createSaleRepository(executor, ctx.tenantId).findPaymentsByKey(
      idempotencyKey,
    );
    if (!existing) return undefined;
    if (existing.requestHash !== requestHash) throw KEY_REUSED;
    return existing.saleId;
  };
  const replay = async (id: string): Promise<RegisterPaymentResult> => ({
    sale: await getSale(db, ctx, id),
    replayed: true,
  });

  const already = await earlierSale(db);
  if (already) return replay(already);

  try {
    const outcome = await db.transaction().execute(async (trx) => {
      const sales = createSaleRepository(trx, ctx.tenantId);
      const sale = await sales.lockSale(saleId);
      if (!sale) throw SALE_NOT_FOUND();

      // Con la venta bloqueada se vuelve a mirar la llave: si otra solicitud igual terminó mientras
      // esperábamos, ese pago es la respuesta y no se cobra dos veces.
      const concurrent = await earlierSale(trx);
      if (concurrent) return { saleId: concurrent, replayed: true };

      if (sale.status === 'cancelled') throw SALE_CANCELLED('pagos');

      const settings = await createStoreRepository(trx, ctx.tenantId).get();
      await applyPayments(trx, ctx, {
        sale: { id: sale.id, folioNumber: sale.folioNumber, total: sale.total },
        lines,
        field: 'lines',
        currency: settings.currency,
        idempotencyKey,
        requestHash,
        now: clock(),
      });
      return { saleId: sale.id, replayed: false };
    });
    return { sale: await getSale(db, ctx, outcome.saleId), replayed: outcome.replayed };
  } catch (error) {
    if (isPaymentKeyConflict(error)) {
      const winner = await earlierSale(db);
      if (winner) return replay(winner);
    }
    throw error;
  }
}

/**
 * Anula un pago con motivo (B4). El pago se conserva marcado como anulado; el saldo y el estado de
 * la venta se recalculan, y si estaba pagada deja de estarlo (sección "Anular pago" de dominio.md).
 */
export async function voidPayment(
  db: Database,
  ctx: AuthContext,
  paymentIdParam: string,
  input: unknown,
  clock: Clock,
): Promise<Sale> {
  const parsedId = uuid.safeParse(paymentIdParam);
  if (!parsedId.success) throw PAYMENT_NOT_FOUND();
  const { reason } = parseInput(voidPaymentSchema, input);

  const saleId = await db.transaction().execute(async (trx) => {
    const sales = createSaleRepository(trx, ctx.tenantId);

    // Se ubica el pago sin bloquear para conocer su venta; luego se bloquea primero la venta y después
    // el pago, en el mismo orden que usa el registro de pagos, para no cruzar bloqueos.
    const located = await sales.findPayment(parsedId.data);
    if (!located) throw PAYMENT_NOT_FOUND();
    const sale = await sales.lockSale(located.saleId);
    if (!sale) throw SALE_NOT_FOUND();
    const payment = await sales.findPayment(parsedId.data, { forUpdate: true });
    if (!payment) throw PAYMENT_NOT_FOUND();

    if (payment.status === 'voided') {
      throw new AppError(409, 'conflict', 'Este pago ya estaba anulado.');
    }
    if (sale.status === 'cancelled') throw SALE_CANCELLED('cambios en sus pagos');

    const now = clock();
    await sales.voidPayment(payment.id, reason, ctx.userId, now);
    const balanceAfter = balanceOf(sale.total, await sales.paidAmount(sale.id));
    // Una venta con saldo mayor que cero deja de estar liquidada (RF-066, RF-071).
    if (sale.settledAt && toCents(balanceAfter) > 0n) await sales.setSettledAt(sale.id, null);

    await recordAudit(trx, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      entity: 'payment',
      entityId: payment.id,
      action: 'void',
      data: {
        saleId: sale.id,
        folio: formatFolio(sale.folioNumber),
        method: payment.method,
        amount: payment.amount,
        reason,
        balanceAfter,
      },
    });
    return sale.id;
  });

  return getSale(db, ctx, saleId);
}

/** Ventas con saldo pendiente de cualquier día, con filtro por fecha de venta (RF-073 a RF-080). */
export async function listPending(
  db: Database,
  ctx: AuthContext,
  query: unknown,
): Promise<PendingList> {
  const filter = parseInput(listPendingQuerySchema, query);
  if (filter.from && filter.to && filter.to < filter.from) {
    throw new AppError(400, 'validation_error', 'Revisa el rango de fechas.', {
      to: 'La fecha final no puede ser anterior a la inicial.',
    });
  }
  const { items, total, totalBalance } = await createSaleRepository(db, ctx.tenantId).listPending(
    filter,
  );
  return {
    items: items.map((row) => {
      const balance = balanceOf(row.total, row.paid);
      return {
        id: row.id,
        folio: formatFolio(row.folioNumber),
        folioNumber: row.folioNumber,
        date: row.date,
        createdAt: row.createdAt.toISOString(),
        customerReference: row.customerReference,
        total: row.total,
        paid: balanceOf(row.paid, '0'),
        balance,
        paymentStatus: collectionStatus({ status: 'active', total: row.total, paid: row.paid }),
      };
    }),
    total,
    totalBalance: balanceOf(totalBalance, '0'),
    limit: filter.limit,
    offset: filter.offset,
  };
}

function isPaymentKeyConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505' &&
    'constraint' in error &&
    error.constraint === 'payments_tenant_idempotency_key'
  );
}
