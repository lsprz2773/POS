import {
  dashboardSchema,
  normalizeQuantity,
  reportQuerySchema,
  toCents,
  todayIn,
  type Dashboard,
  type Report,
} from '@pos/shared';
import type { Database } from '../../db/client';
import { parseInput } from '../../validation';
import { createSaleRepository } from '../sales/sale.repository';
import { createStoreRepository } from '../store/store.repository';
import type { AuthContext } from '../tenancy/context';
import { createWorkdayRepository } from '../workdays/workday.repository';
import type { Clock } from '../workdays/workday.usecases';
import {
  averageTicketCents,
  formatSignedCents,
  grossMargin,
  resolvePeriod,
  type Period,
} from './report.domain';
import { createReportRepository } from './report.repository';

const TOP_PRODUCTS = 10;

/** Lecturas de un reporte sobre una misma foto de los datos, para que las cifras cuadren entre sí. */
const snapshot = <T>(db: Database, work: (trx: Database) => Promise<T>) =>
  db.transaction().setIsolationLevel('repeatable read').execute(work);

async function buildReport(
  db: Database,
  tenantId: string,
  period: Period,
  timezone: string,
  topLimit: number,
): Promise<Report> {
  const reports = createReportRepository(db, tenantId);
  const sales = await reports.sales(period.from, period.to);
  const items = await reports.items(period.from, period.to);
  const collectedBy = await reports.collected(period.from, period.to, timezone);
  const top = topLimit > 0 ? await reports.topProducts(period.from, period.to, topLimit) : [];

  const salesCents = toCents(sales.salesTotal);
  const profitCents = salesCents - toCents(items.cost);
  return {
    from: period.from,
    to: period.to,
    salesTotal: sales.salesTotal,
    salesCount: sales.salesCount,
    averageTicket: formatSignedCents(averageTicketCents(salesCents, sales.salesCount)),
    unitsSold: normalizeQuantity(items.units),
    collected: formatSignedCents(toCents(collectedBy.cash) + toCents(collectedBy.transfer)),
    collectedByMethod: collectedBy,
    pending: sales.pending,
    costOfGoodsSold: items.cost,
    grossProfit: formatSignedCents(profitCents),
    isGrossLoss: profitCents < 0n,
    grossMargin: grossMargin(profitCents, salesCents),
    topProducts: top.map((row) => ({
      productId: row.productId,
      name: row.name,
      units: normalizeQuantity(row.units),
      amount: row.amount,
    })),
    cancelled: {
      count: sales.cancelledCount,
      total: sales.cancelledTotal,
      refundDue: sales.refundDue,
    },
  };
}

/** Reporte de un día, semana, mes o rango, con las definiciones de dominio.md (RF-081 a RF-105). */
export async function getReport(
  db: Database,
  ctx: AuthContext,
  query: unknown,
  clock: Clock,
): Promise<Report> {
  const parsed = parseInput(reportQuerySchema, query);
  const settings = await createStoreRepository(db, ctx.tenantId).get();
  const period = resolvePeriod(parsed, todayIn(settings.timezone, clock()));
  return snapshot(db, (trx) =>
    buildReport(trx, ctx.tenantId, period, settings.timezone, TOP_PRODUCTS),
  );
}

/** Indicadores de hoy para la pantalla principal (RF-079, RNF-044). */
export async function getDashboard(
  db: Database,
  ctx: AuthContext,
  clock: Clock,
): Promise<Dashboard> {
  const settings = await createStoreRepository(db, ctx.tenantId).get();
  const today = todayIn(settings.timezone, clock());

  const view = await snapshot(db, async (trx) => {
    const report = await buildReport(
      trx,
      ctx.tenantId,
      { from: today, to: today },
      settings.timezone,
      0,
    );
    const pending = await createSaleRepository(trx, ctx.tenantId).listPending({
      limit: 1,
      offset: 0,
    });
    const workday = await createWorkdayRepository(trx, ctx.tenantId).findByDate(today);
    return { report, pending, dayPrepared: workday !== undefined };
  });

  return dashboardSchema.parse({
    date: today,
    salesTotal: view.report.salesTotal,
    salesCount: view.report.salesCount,
    collected: view.report.collected,
    collectedByMethod: view.report.collectedByMethod,
    pendingCount: view.pending.total,
    pendingTotal: formatSignedCents(toCents(view.pending.totalBalance)),
    estimatedGrossProfit: view.report.grossProfit,
    isGrossLoss: view.report.isGrossLoss,
    dayPrepared: view.dayPrepared,
  });
}
