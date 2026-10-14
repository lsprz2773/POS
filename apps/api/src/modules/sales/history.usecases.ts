import {
  balanceOf,
  collectionStatus,
  formatFolio,
  listSalesQuerySchema,
  type SalesList,
} from '@pos/shared';
import type { Database } from '../../db/client';
import { AppError } from '../../errors';
import { parseInput } from '../../validation';
import type { AuthContext } from '../tenancy/context';
import { assertCan, scopeFor } from '../tenancy/permissions';
import { createSaleRepository } from './sale.repository';

/** Historial de ventas con filtros, búsqueda por folio o cliente y paginación (RNF-006). */
export async function listSales(
  db: Database,
  ctx: AuthContext,
  query: unknown,
): Promise<SalesList> {
  assertCan(ctx, 'sale:read');
  const filter = parseInput(listSalesQuerySchema, query);
  if (filter.from && filter.to && filter.to < filter.from) {
    throw new AppError(400, 'validation_error', 'Revisa el rango de fechas.', {
      to: 'La fecha final no puede ser anterior a la inicial.',
    });
  }
  const { items, total } = await createSaleRepository(
    db,
    ctx.tenantId,
    scopeFor(ctx, filter.sellerId),
  ).list(filter);
  return {
    items: items.map((row) => ({
      id: row.id,
      folio: formatFolio(row.folioNumber),
      folioNumber: row.folioNumber,
      date: row.date,
      createdAt: row.createdAt.toISOString(),
      customerReference: row.customerReference,
      status: row.status,
      total: row.total,
      paid: balanceOf(row.paid, '0'),
      balance: row.status === 'cancelled' ? '0.00' : balanceOf(row.total, row.paid),
      paymentStatus: collectionStatus({ status: row.status, total: row.total, paid: row.paid }),
      createdBy: row.createdBy,
    })),
    total,
    limit: filter.limit,
    offset: filter.offset,
  };
}
