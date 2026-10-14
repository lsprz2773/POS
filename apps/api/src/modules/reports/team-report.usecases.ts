import {
  normalizeQuantity,
  reportQuerySchema,
  toCents,
  todayIn,
  type OwedBySeller,
  type Period,
  type SellerDetail,
  type SellerReportRow,
  type SellersReport,
  type TodayBySeller,
} from '@pos/shared';
import { z } from 'zod';
import type { Database } from '../../db/client';
import { AppError } from '../../errors';
import { parseInput } from '../../validation';
import { createStoreRepository } from '../store/store.repository';
import type { AuthContext } from '../tenancy/context';
import { assertCan } from '../tenancy/permissions';
import type { Clock } from '../workdays/workday.usecases';
import {
  averageTicketCents,
  datesIn,
  formatSignedCents,
  grossMargin,
  previousPeriod,
  resolvePeriod,
} from './report.domain';
import { createReportRepository } from './report.repository';
import { createTeamReportRepository, type MemberInfo } from './team-report.repository';

const TOP_PRODUCTS = 10;
const MEMBER_NOT_FOUND = () => new AppError(404, 'not_found', 'Esa persona ya no está disponible.');

/** Lecturas sobre una misma foto de los datos, para que las filas cuadren con el total (RF-144). */
const snapshot = <T>(db: Database, work: (trx: Database) => Promise<T>) =>
  db.transaction().setIsolationLevel('repeatable read').execute(work);

export const displayName = (member: Pick<MemberInfo, 'displayName' | 'email'>) =>
  member.displayName ?? member.email;

const sumCents = (values: string[]) => values.reduce((total, value) => total + toCents(value), 0n);

interface TeamBuild {
  rows: SellerReportRow[];
  hasSellers: boolean;
  members: MemberInfo[];
}

/**
 * Cifras de cada persona en el periodo (T111). Aparecen el propietario, los vendedores activos y los dados
 * de baja que tengan ventas, cobros o saldo; así la suma de las filas cuadra con el reporte general.
 */
async function buildTeam(
  trx: Database,
  tenantId: string,
  period: Period,
  timezone: string,
  forceUserId?: string,
): Promise<TeamBuild> {
  const repo = createTeamReportRepository(trx, tenantId);
  const [members, sales, items, collected, owed] = await Promise.all([
    repo.members(),
    repo.salesBySeller(period.from, period.to),
    repo.itemsBySeller(period.from, period.to),
    repo.collectedBySeller(period.from, period.to, timezone),
    repo.owedBySeller(),
  ]);

  const storeSalesCents = sumCents(sales.map((row) => row.salesTotal));
  const rows: SellerReportRow[] = [];
  for (const member of members) {
    const sold = sales.find((row) => row.userId === member.userId);
    const stock = items.find((row) => row.userId === member.userId);
    const cash = collected.find((row) => row.userId === member.userId && row.method === 'cash');
    const transfer = collected.find(
      (row) => row.userId === member.userId && row.method === 'transfer',
    );
    const debt = owed.find((row) => row.userId === member.userId);

    const hasActivity =
      (sold?.salesCount ?? 0) > 0 ||
      (sold?.cancelledCount ?? 0) > 0 ||
      cash !== undefined ||
      transfer !== undefined ||
      (debt?.count ?? 0) > 0;
    const visible =
      member.role === 'owner' ||
      member.status === 'active' ||
      hasActivity ||
      member.userId === forceUserId;
    if (!visible) continue;

    const salesCents = toCents(sold?.salesTotal ?? '0');
    const profitCents = salesCents - toCents(stock?.cost ?? '0');
    const salesCount = sold?.salesCount ?? 0;
    const cancelledCount = sold?.cancelledCount ?? 0;
    const cashAmount = cash?.amount ?? '0.00';
    const transferAmount = transfer?.amount ?? '0.00';
    rows.push({
      userId: member.userId,
      name: displayName(member),
      email: member.email,
      role: member.role,
      status: member.status,
      salesTotal: formatSignedCents(salesCents),
      salesCount,
      averageTicket: formatSignedCents(averageTicketCents(salesCents, salesCount)),
      unitsSold: normalizeQuantity(stock?.units ?? '0'),
      collected: formatSignedCents(toCents(cashAmount) + toCents(transferAmount)),
      collectedByMethod: { cash: cashAmount, transfer: transferAmount },
      pending: sold?.pending ?? '0.00',
      costOfGoodsSold: stock?.cost ?? '0.00',
      grossProfit: formatSignedCents(profitCents),
      isGrossLoss: profitCents < 0n,
      grossMargin: grossMargin(profitCents, salesCents),
      share: grossMargin(salesCents, storeSalesCents),
      cancelled: {
        count: cancelledCount,
        total: sold?.cancelledTotal ?? '0.00',
        refundDue: sold?.refundDue ?? '0.00',
        rate: grossMargin(BigInt(cancelledCount), BigInt(salesCount + cancelledCount)),
      },
      owed: { total: debt?.total ?? '0.00', count: debt?.count ?? 0 },
    });
  }
  return { rows, hasSellers: members.some((m) => m.role === 'seller'), members };
}

/** Reporte por vendedor y periodo, con lo que se le debe a cada uno (RF-142 a RF-144, T111, T112). */
export async function getSellersReport(
  db: Database,
  ctx: AuthContext,
  query: unknown,
  clock: Clock,
): Promise<SellersReport> {
  assertCan(ctx, 'team:report');
  const parsed = parseInput(reportQuerySchema, query);
  const settings = await createStoreRepository(db, ctx.tenantId).get();
  const period = resolvePeriod(parsed, todayIn(settings.timezone, clock()));

  const { rows, hasSellers } = await snapshot(db, (trx) =>
    buildTeam(trx, ctx.tenantId, period, settings.timezone),
  );
  const sum = (pick: (row: SellerReportRow) => string) =>
    formatSignedCents(sumCents(rows.map(pick)));
  return {
    from: period.from,
    to: period.to,
    hasSellers,
    items: rows,
    totals: {
      salesTotal: sum((row) => row.salesTotal),
      salesCount: rows.reduce((total, row) => total + row.salesCount, 0),
      costOfGoodsSold: sum((row) => row.costOfGoodsSold),
      grossProfit: sum((row) => row.grossProfit),
      collected: sum((row) => row.collected),
      pending: sum((row) => row.pending),
      owed: {
        total: sum((row) => row.owed.total),
        count: rows.reduce((total, row) => total + row.owed.count, 0),
      },
    },
  };
}

/** Detalle de una persona: sus cifras, su pendiente con antigüedad, sus productos, su serie diaria y el aprovechamiento. */
export async function getSellerDetail(
  db: Database,
  ctx: AuthContext,
  userIdParam: string,
  query: unknown,
  clock: Clock,
): Promise<SellerDetail> {
  assertCan(ctx, 'team:report');
  const parsedId = z.uuid().safeParse(userIdParam);
  if (!parsedId.success) throw MEMBER_NOT_FOUND();
  const userId = parsedId.data;
  const parsed = parseInput(reportQuerySchema, query);
  const settings = await createStoreRepository(db, ctx.tenantId).get();
  const today = todayIn(settings.timezone, clock());
  const period = resolvePeriod(parsed, today);
  const before = previousPeriod(period);

  return snapshot(db, async (trx) => {
    const team = await buildTeam(trx, ctx.tenantId, period, settings.timezone, userId);
    const seller = team.rows.find((row) => row.userId === userId);
    if (!seller) throw MEMBER_NOT_FOUND();

    const repo = createTeamReportRepository(trx, ctx.tenantId);
    const [top, daily, aging, usage, prevSales, prevItems] = await Promise.all([
      createReportRepository(trx, ctx.tenantId, { sellerId: userId }).topProducts(
        period.from,
        period.to,
        TOP_PRODUCTS,
      ),
      repo.dailyOf(userId, period.from, period.to),
      repo.agingOf(userId, today),
      repo.utilizationOf(userId, period.from, period.to),
      repo.salesBySeller(before.from, before.to),
      repo.itemsBySeller(before.from, before.to),
    ]);

    const prevTotal = prevSales.find((row) => row.userId === userId)?.salesTotal ?? '0.00';
    const prevCost = prevItems.find((row) => row.userId === userId)?.cost ?? '0.00';
    const byDate = new Map(daily.map((row) => [row.date, row]));
    const preparedCents = toCents(usage.prepared);

    return {
      from: period.from,
      to: period.to,
      seller,
      topProducts: top.map((row) => ({
        productId: row.productId,
        name: row.name,
        units: normalizeQuantity(row.units),
        amount: row.amount,
      })),
      daily: datesIn(period).map((date) => ({
        date,
        salesTotal: byDate.get(date)?.salesTotal ?? '0.00',
        salesCount: byDate.get(date)?.salesCount ?? 0,
      })),
      previous: {
        from: before.from,
        to: before.to,
        salesTotal: prevTotal,
        salesCount: prevSales.find((row) => row.userId === userId)?.salesCount ?? 0,
        grossProfit: formatSignedCents(toCents(prevTotal) - toCents(prevCost)),
      },
      aging: {
        upTo7: { total: aging.upTo7Total, count: aging.upTo7Count },
        from8To30: { total: aging.from8To30Total, count: aging.from8To30Count },
        over30: { total: aging.over30Total, count: aging.over30Count },
      },
      utilization: {
        preparedUnits: normalizeQuantity(usage.prepared),
        soldUnits: normalizeQuantity(usage.sold),
        // Las piezas llevan 3 decimales: se compara en milésimas.
        soldPercent:
          preparedCents > 0n
            ? grossMargin(toMilliUnits(usage.sold), toMilliUnits(usage.prepared))
            : null,
        products: usage.products,
        soldOutProducts: usage.soldOut,
      },
    };
  });
}

/** "12.500" → 12500n: cantidades con 3 decimales como enteros. */
function toMilliUnits(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole! + fraction.padEnd(3, '0').slice(0, 3));
}

/** Lo que se le debe a cada persona, para el propietario cuando la tienda tiene vendedores (T112). */
export async function owedBySellerFor(
  db: Database,
  ctx: AuthContext,
): Promise<OwedBySeller[] | undefined> {
  if (ctx.role !== 'owner') return undefined;
  const repo = createTeamReportRepository(db, ctx.tenantId);
  const [members, owed] = await Promise.all([repo.members(), repo.owedBySeller()]);
  if (!members.some((member) => member.role === 'seller')) return undefined;
  return members
    .map((member) => ({ member, debt: owed.find((row) => row.userId === member.userId) }))
    .filter(({ debt }) => debt !== undefined)
    .map(({ member, debt }) => ({
      userId: member.userId,
      name: displayName(member),
      status: member.status,
      total: debt!.total,
      count: debt!.count,
    }));
}

/** Lo de hoy de cada persona para el bloque "Por vendedor" de la pantalla Hoy. */
export async function todayBySellerFor(
  trx: Database,
  ctx: AuthContext,
  today: string,
  timezone: string,
): Promise<TodayBySeller[] | undefined> {
  if (ctx.role !== 'owner') return undefined;
  const team = await buildTeam(trx, ctx.tenantId, { from: today, to: today }, timezone);
  if (!team.hasSellers) return undefined;
  return team.rows.map((row) => ({
    userId: row.userId,
    name: row.name,
    status: row.status,
    salesTotal: row.salesTotal,
    salesCount: row.salesCount,
    collected: row.collected,
    owed: row.owed,
  }));
}
