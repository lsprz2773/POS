import { createSaleSchema, idempotencyKeySchema, normalizeQuantity, type Sale } from '@pos/shared';
import { z } from 'zod';
import type { Database } from '../../db/client';
import { AppError } from '../../errors';
import { parseInput } from '../../validation';
import { recordAudit } from '../audit/audit';
import { createStoreRepository } from '../store/store.repository';
import type { AuthContext } from '../tenancy/context';
import { availableQuantity, isWholeQuantity, toMilli, todayIn } from '../workdays/workday.domain';
import { createWorkdayRepository } from '../workdays/workday.repository';
import type { Clock } from '../workdays/workday.usecases';
import {
  balanceOf,
  collectionStatus,
  formatFolio,
  hashSaleRequest,
  isOutsideHours,
  lineSubtotal,
  sumMoney,
} from './sale.domain';
import { applyPayments } from './payment.apply';
import { createSaleRepository, type NewSaleItem } from './sale.repository';

export const KEY_REUSED = new AppError(
  409,
  'conflict',
  'Esa llave de idempotencia ya se usó con otra venta distinta. Genera una nueva para una venta nueva.',
);
const DAY_NOT_PREPARED = new AppError(
  409,
  'conflict',
  'Prepara el día antes de vender: hoy todavía no tiene productos.',
);
const SALE_NOT_FOUND = () => new AppError(404, 'not_found', 'Esa venta ya no está disponible.');

export interface CreateSaleResult {
  sale: Sale;
  /** Verdadero si la llave ya había creado esta venta y solo se devuelve la original. */
  replayed: boolean;
}

export async function getSale(db: Database, ctx: AuthContext, id: string): Promise<Sale> {
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) throw SALE_NOT_FOUND();

  const found = await createSaleRepository(db, ctx.tenantId).findById(parsedId.data);
  if (!found) throw SALE_NOT_FOUND();
  const settings = await createStoreRepository(db, ctx.tenantId).get();
  const { sale, items, payments } = found;
  const paid = sumMoney(
    payments.filter((payment) => payment.status === 'valid').map((payment) => payment.amount),
  );

  return {
    id: sale.id,
    folio: formatFolio(sale.folioNumber),
    folioNumber: sale.folioNumber,
    date: sale.date,
    createdAt: sale.createdAt.toISOString(),
    status: sale.status,
    customerReference: sale.customerReference,
    note: sale.note,
    total: sale.total,
    outsideWorkdayHours: isOutsideHours(settings.timezone, sale.createdAt, sale),
    paid,
    balance: balanceOf(sale.total, paid),
    paymentStatus: collectionStatus({ status: sale.status, total: sale.total, paid }),
    settledAt: sale.settledAt?.toISOString() ?? null,
    payments: payments.map((payment) => ({
      id: payment.id,
      operationId: payment.operationId,
      method: payment.method,
      amount: payment.amount,
      status: payment.status,
      createdAt: payment.createdAt.toISOString(),
      voidedAt: payment.voidedAt?.toISOString() ?? null,
      voidReason: payment.voidReason,
    })),
    items: items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      quantity: normalizeQuantity(item.quantity),
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
    })),
  };
}

/**
 * Crea la venta de hoy. En una sola transacción: bloquea los productos del día, comprueba las
 * existencias, congela nombre, precio y costo, toma el siguiente folio, guarda la venta y su
 * auditoría. Si algo falla, no queda nada a medias (RF-047, RF-048).
 *
 * La llave de idempotencia hace seguro el reintento: la misma llave y el mismo contenido devuelven
 * la venta original; la misma llave con otro contenido es un conflicto (RF-062, T7).
 */
export async function createSale(
  db: Database,
  ctx: AuthContext,
  rawKey: unknown,
  input: unknown,
  clock: Clock,
): Promise<CreateSaleResult> {
  const { idempotencyKey } = parseInput(z.object({ idempotencyKey: idempotencyKeySchema }), {
    idempotencyKey: rawKey,
  });
  const data = parseInput(createSaleSchema, input);
  const requestHash = hashSaleRequest(data);

  /** Id de la venta que esta llave ya creó, si existe; error si el contenido no coincide. */
  const earlierSale = async (executor: Database): Promise<string | undefined> => {
    const existing = await createSaleRepository(executor, ctx.tenantId).findByIdempotencyKey(
      idempotencyKey,
    );
    if (!existing) return undefined;
    if (existing.requestHash !== requestHash) throw KEY_REUSED;
    return existing.id;
  };
  const replay = async (saleId: string): Promise<CreateSaleResult> => ({
    sale: await getSale(db, ctx, saleId),
    replayed: true,
  });

  // Reintento habitual: se responde sin tocar inventario ni exigir que el día siga abierto.
  const already = await earlierSale(db);
  if (already) return replay(already);

  try {
    const outcome = await db.transaction().execute(async (trx) => {
      const settings = await createStoreRepository(trx, ctx.tenantId).get();
      const now = clock();
      const today = todayIn(settings.timezone, now);
      const workdays = createWorkdayRepository(trx, ctx.tenantId);
      const workday = await workdays.findByDate(today);
      if (!workday) throw DAY_NOT_PREPARED;

      const sales = createSaleRepository(trx, ctx.tenantId);
      const offers = await sales.lockOffers(
        workday.id,
        data.items.map((item) => item.productId),
      );

      // Con los productos bloqueados se vuelve a mirar la llave: si otra solicitud igual terminó
      // mientras esperábamos, esa venta es la respuesta y no se vende dos veces.
      const concurrent = await earlierSale(trx);
      if (concurrent) return { saleId: concurrent, replayed: true };

      const byProduct = new Map(offers.map((offer) => [offer.productId, offer]));

      const invalid: Record<string, string> = {};
      data.items.forEach((item, index) => {
        const offer = byProduct.get(item.productId);
        if (!offer) {
          invalid[`items.${index}.productId`] = 'Ese producto no está en la disponibilidad de hoy.';
        } else if (!offer.productActive) {
          invalid[`items.${index}.productId`] = 'Este producto está desactivado.';
        } else if (!offer.allowsFractions && !isWholeQuantity(item.quantity)) {
          invalid[`items.${index}.quantity`] = 'Este producto se vende en piezas enteras.';
        }
      });
      if (Object.keys(invalid).length > 0) {
        throw new AppError(400, 'validation_error', 'Revisa los datos ingresados.', invalid);
      }

      const short: Record<string, string> = {};
      data.items.forEach((item, index) => {
        const offer = byProduct.get(item.productId)!;
        const available = availableQuantity({
          initial: offer.initialQuantity,
          adjusted: offer.adjustedQuantity,
          sold: offer.soldQuantity,
        });
        if (toMilli(item.quantity) > toMilli(available)) {
          short[`items.${index}.quantity`] =
            toMilli(available) === 0n
              ? `${offer.productName} está agotado.`
              : `Solo quedan ${available} de ${offer.productName}.`;
        }
      });
      if (Object.keys(short).length > 0) {
        throw new AppError(
          409,
          'insufficient_stock',
          'No hay inventario suficiente para completar la venta.',
          short,
        );
      }

      // Precio, costo y nombre salen del catálogo en este instante y quedan congelados (B5).
      const items: NewSaleItem[] = data.items.map((item) => {
        const offer = byProduct.get(item.productId)!;
        return {
          offerId: offer.offerId,
          productId: offer.productId,
          productName: offer.productName,
          quantity: item.quantity,
          unitPrice: offer.unitPrice,
          unitCost: offer.unitCost,
          subtotal: lineSubtotal(item.quantity, offer.unitPrice),
        };
      });
      const total = sumMoney(items.map((item) => item.subtotal));

      const folio = await sales.nextFolio();
      const saleId = await sales.insertSale({
        workdayId: workday.id,
        folio,
        customerReference: data.customerReference ?? null,
        note: data.note ?? null,
        total,
        createdBy: ctx.userId,
        idempotencyKey,
        requestHash,
        createdAt: now,
        items,
      });
      await recordAudit(trx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        entity: 'sale',
        entityId: saleId,
        action: 'create',
        data: { folio: formatFolio(folio), date: today, total, items: items.length },
      });
      // El pago opcional viaja en la misma operación: si no se puede cobrar, no hay venta (RF-058).
      if (data.payments) {
        await applyPayments(trx, ctx, {
          sale: { id: saleId, folioNumber: folio, total },
          lines: data.payments,
          field: 'payments',
          currency: settings.currency,
          idempotencyKey,
          requestHash,
          now,
        });
      }
      return { saleId, replayed: false };
    });

    return { sale: await getSale(db, ctx, outcome.saleId), replayed: outcome.replayed };
  } catch (error) {
    // Dos solicitudes idénticas a la vez: la que pierde la carrera devuelve la venta de la ganadora.
    if (isIdempotencyConflict(error)) {
      const winner = await earlierSale(db);
      if (winner) return replay(winner);
    }
    throw error;
  }
}

function isIdempotencyConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505' &&
    'constraint' in error &&
    error.constraint === 'sales_tenant_idempotency_key'
  );
}
