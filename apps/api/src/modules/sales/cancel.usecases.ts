import { cancelSaleSchema, type Sale } from '@pos/shared';
import { z } from 'zod';
import type { Database } from '../../db/client';
import { AppError } from '../../errors';
import { parseInput } from '../../validation';
import { recordAudit } from '../audit/audit';
import { createStoreRepository } from '../store/store.repository';
import type { AuthContext } from '../tenancy/context';
import { todayIn } from '../workdays/workday.domain';
import type { Clock } from '../workdays/workday.usecases';
import { formatFolio } from './sale.domain';
import { createSaleRepository } from './sale.repository';
import { getSale } from './sale.usecases';

const SALE_NOT_FOUND = () => new AppError(404, 'not_found', 'Esa venta ya no está disponible.');

/**
 * Cancela una venta con motivo (RF-111 a RF-113). La venta se conserva con su folio, renglones y
 * pagos. Si es de hoy, las piezas vuelven a estar disponibles; si es de un día anterior el inventario
 * no se restituye y ese día conserva su historial (B13). Los pagos no se tocan: lo cobrado queda como
 * "por devolver fuera del sistema" (B14). Bloquea la venta, así que no se cancela dos veces ni se
 * cruza con un pago que se esté registrando.
 */
export async function cancelSale(
  db: Database,
  ctx: AuthContext,
  saleIdParam: string,
  input: unknown,
  clock: Clock,
): Promise<Sale> {
  const parsedId = z.uuid().safeParse(saleIdParam);
  if (!parsedId.success) throw SALE_NOT_FOUND();
  const { reason } = parseInput(cancelSaleSchema, input);

  const saleId = await db.transaction().execute(async (trx) => {
    const sales = createSaleRepository(trx, ctx.tenantId);
    const sale = await sales.lockSale(parsedId.data);
    if (!sale) throw SALE_NOT_FOUND();
    if (sale.status === 'cancelled') {
      throw new AppError(409, 'conflict', 'Esta venta ya estaba cancelada.');
    }

    const now = clock();
    const settings = await createStoreRepository(trx, ctx.tenantId).get();
    const saleDate = await sales.saleDate(sale.id);
    const inventoryRestored = saleDate === todayIn(settings.timezone, now);

    await sales.cancel({ saleId: sale.id, reason, inventoryRestored, userId: ctx.userId, at: now });
    const refundDue = await sales.paidAmount(sale.id);

    await recordAudit(trx, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      entity: 'sale',
      entityId: sale.id,
      action: 'cancel',
      data: {
        folio: formatFolio(sale.folioNumber),
        date: saleDate,
        total: sale.total,
        reason,
        inventoryRestored,
        refundDue,
      },
    });
    return sale.id;
  });

  return getSale(db, ctx, saleId);
}
