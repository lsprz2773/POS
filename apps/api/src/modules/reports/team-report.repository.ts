import { sql } from 'kysely';
import type { MemberStatus, Role } from '@pos/shared';
import type { Database } from '../../db/client';
import { COUNTS_AS_SOLD } from '../workdays/sold';

export interface MemberInfo {
  userId: string;
  email: string;
  displayName: string | null;
  role: Role;
  status: MemberStatus;
}

export interface SalesBySeller {
  userId: string;
  salesCount: number;
  salesTotal: string;
  pending: string;
  cancelledCount: number;
  cancelledTotal: string;
  refundDue: string;
}

export interface OwedRow {
  userId: string;
  total: string;
  count: number;
}

/**
 * Consultas de los reportes del equipo (fase 10d): las mismas definiciones de `report.repository.ts`,
 * agrupadas por quien registró la venta (`sales.created_by`). Todo se suma en la base y el tenant se fija
 * al construir el repositorio, así que nunca aparece gente ni ventas de otra tienda.
 */
export function createTeamReportRepository(db: Database, tenantId: string) {
  const inPeriod = (from: string, to: string) =>
    sql`w.tenant_id = s.tenant_id and w.business_date between ${from}::date and ${to}::date`;
  const paidOf = sql`(select coalesce(sum(pay.amount), 0) from payments pay
    where pay.sale_id = s.id and pay.tenant_id = s.tenant_id and pay.status = 'valid')`;

  return {
    async members(): Promise<MemberInfo[]> {
      const rows = await db
        .selectFrom('memberships as m')
        .innerJoin('users as u', 'u.id', 'm.user_id')
        .select([
          'u.id as userId',
          'u.email',
          'u.display_name as displayName',
          'm.role',
          'm.status',
        ])
        .where('m.tenant_id', '=', tenantId)
        .orderBy('m.role', 'asc')
        .orderBy((eb) => eb.fn('lower', [eb.fn.coalesce('u.display_name', 'u.email')]))
        .orderBy('u.id')
        .execute();
      return rows as MemberInfo[];
    },

    /** Ventas del periodo por persona: vigentes y canceladas por separado, con lo que falta por cobrar. */
    async salesBySeller(from: string, to: string): Promise<SalesBySeller[]> {
      const { rows } = await sql<SalesBySeller>`
        select
          s.created_by as "userId",
          (count(*) filter (where s.status = 'active'))::int as "salesCount",
          coalesce(sum(s.total) filter (where s.status = 'active'), 0)::numeric(14, 2)::text as "salesTotal",
          coalesce(sum(s.total - p.paid) filter (where s.status = 'active'), 0)::numeric(14, 2)::text as "pending",
          (count(*) filter (where s.status = 'cancelled'))::int as "cancelledCount",
          coalesce(sum(s.total) filter (where s.status = 'cancelled'), 0)::numeric(14, 2)::text as "cancelledTotal",
          coalesce(sum(p.paid) filter (where s.status = 'cancelled'), 0)::numeric(14, 2)::text as "refundDue"
        from sales s
        join workdays w on w.id = s.workday_id and ${inPeriod(from, to)}
        cross join lateral (select ${paidOf} as paid) p
        where s.tenant_id = ${tenantId}
        group by s.created_by`.execute(db);
      return rows;
    },

    async itemsBySeller(
      from: string,
      to: string,
    ): Promise<{ userId: string; units: string; cost: string }[]> {
      const { rows } = await sql<{ userId: string; units: string; cost: string }>`
        select
          s.created_by as "userId",
          coalesce(sum(si.quantity), 0)::numeric(14, 3)::text as units,
          coalesce(sum(round(si.quantity * si.unit_cost, 2)), 0)::numeric(14, 2)::text as cost
        from sale_items si
        join sales s on s.id = si.sale_id and s.tenant_id = si.tenant_id
        join workdays w on w.id = s.workday_id and ${inPeriod(from, to)}
        where si.tenant_id = ${tenantId} and s.status = 'active'
        group by s.created_by`.execute(db);
      return rows;
    },

    /** Pagos vigentes recibidos en el periodo (día completo en la zona de la tienda) sobre ventas vigentes de cada persona. */
    async collectedBySeller(
      from: string,
      to: string,
      timezone: string,
    ): Promise<{ userId: string; method: 'cash' | 'transfer'; amount: string }[]> {
      const { rows } = await sql<{ userId: string; method: 'cash' | 'transfer'; amount: string }>`
        select s.created_by as "userId", p.method, sum(p.amount)::numeric(14, 2)::text as amount
        from payments p
        join sales s on s.id = p.sale_id and s.tenant_id = p.tenant_id
        where p.tenant_id = ${tenantId} and p.status = 'valid' and s.status = 'active'
          and p.created_at >= (${from}::date)::timestamp at time zone ${timezone}
          and p.created_at < (${to}::date + 1)::timestamp at time zone ${timezone}
        group by s.created_by, p.method`.execute(db);
      return rows;
    },

    /** Lo que se le debe a cada persona: saldo de sus ventas vigentes de cualquier día (T112). */
    async owedBySeller(): Promise<OwedRow[]> {
      const { rows } = await sql<OwedRow>`
        select
          s.created_by as "userId",
          coalesce(sum(s.total - p.paid), 0)::numeric(14, 2)::text as total,
          count(*)::int as count
        from sales s
        cross join lateral (select ${paidOf} as paid) p
        where s.tenant_id = ${tenantId} and s.status = 'active' and s.total > p.paid
        group by s.created_by`.execute(db);
      return rows;
    },

    /** Antigüedad de lo que se le debe a una persona, en días desde la fecha de negocio de la venta. */
    async agingOf(userId: string, today: string) {
      const { rows } = await sql<{
        upTo7Total: string;
        upTo7Count: number;
        from8To30Total: string;
        from8To30Count: number;
        over30Total: string;
        over30Count: number;
      }>`
        select
          coalesce(sum(s.total - p.paid) filter (where age <= 7), 0)::numeric(14, 2)::text as "upTo7Total",
          (count(*) filter (where age <= 7))::int as "upTo7Count",
          coalesce(sum(s.total - p.paid) filter (where age between 8 and 30), 0)::numeric(14, 2)::text as "from8To30Total",
          (count(*) filter (where age between 8 and 30))::int as "from8To30Count",
          coalesce(sum(s.total - p.paid) filter (where age > 30), 0)::numeric(14, 2)::text as "over30Total",
          (count(*) filter (where age > 30))::int as "over30Count"
        from sales s
        join workdays w on w.id = s.workday_id and w.tenant_id = s.tenant_id
        cross join lateral (select ${paidOf} as paid) p
        cross join lateral (select (${today}::date - w.business_date) as age) a
        where s.tenant_id = ${tenantId} and s.created_by = ${userId}
          and s.status = 'active' and s.total > p.paid`.execute(db);
      return rows[0]!;
    },

    /** Ventas vigentes por día del periodo (solo los días con ventas). */
    async dailyOf(userId: string, from: string, to: string) {
      const { rows } = await sql<{ date: string; salesTotal: string; salesCount: number }>`
        select
          w.business_date::text as date,
          sum(s.total)::numeric(14, 2)::text as "salesTotal",
          count(*)::int as "salesCount"
        from sales s
        join workdays w on w.id = s.workday_id and ${inPeriod(from, to)}
        where s.tenant_id = ${tenantId} and s.created_by = ${userId} and s.status = 'active'
        group by w.business_date
        order by w.business_date`.execute(db);
      return rows;
    },

    /** Piezas preparadas (inicial más aumentos) contra vendidas por una persona en el periodo. */
    async utilizationOf(userId: string, from: string, to: string) {
      const { rows } = await sql<{
        prepared: string;
        sold: string;
        products: number;
        soldOut: number;
      }>`
        select
          coalesce(sum(o.initial_quantity + coalesce(adj.inc, 0)), 0)::numeric(14, 3)::text as prepared,
          coalesce(sum(coalesce(sold.qty, 0)), 0)::numeric(14, 3)::text as sold,
          count(*)::int as products,
          (count(*) filter (where o.initial_quantity + coalesce(adj.inc, 0) - coalesce(sold.qty, 0) <= 0))::int as "soldOut"
        from daily_offers o
        join workdays w on w.id = o.workday_id and w.tenant_id = o.tenant_id
          and w.business_date between ${from}::date and ${to}::date
        left join lateral (
          select sum(a.increment) as inc from stock_adjustments a
          where a.daily_offer_id = o.id and a.tenant_id = o.tenant_id
        ) adj on true
        left join lateral (
          select sum(si.quantity) as qty
          from sale_items si
          join sales s on s.id = si.sale_id and s.tenant_id = si.tenant_id
          where si.daily_offer_id = o.id and si.tenant_id = o.tenant_id and ${COUNTS_AS_SOLD}
        ) sold on true
        where o.tenant_id = ${tenantId} and o.user_id = ${userId}`.execute(db);
      return rows[0]!;
    },
  };
}
