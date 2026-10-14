import { sql } from 'kysely';
import type { Database } from '../../db/client';
import type { RowScope } from '../tenancy/permissions';

export interface SalesAggregate {
  salesCount: number;
  salesTotal: string;
  pending: string;
  cancelledCount: number;
  cancelledTotal: string;
  refundDue: string;
}

export interface TopProductRow {
  productId: string;
  name: string;
  units: string;
  amount: string;
}

/**
 * Consultas de agregación de reportes y dashboard. Todo se suma en la base (RNF-007) y el tenant se
 * fija al construir el repositorio. Las ventas se ubican por la fecha de negocio de su jornada; los
 * pagos, por el instante en que se recibieron, convertido a la zona horaria de la tienda (RF-095).
 * Con `scope.sellerId` el reporte es el mismo cálculo acotado a las ventas de esa persona (T104).
 */
export function createReportRepository(db: Database, tenantId: string, scope: RowScope = {}) {
  const ownSales = scope.sellerId ? sql`and s.created_by = ${scope.sellerId}` : sql``;
  const inPeriod = (from: string, to: string) =>
    sql`w.tenant_id = s.tenant_id and w.business_date between ${from}::date and ${to}::date`;

  return {
    /** Ventas del periodo: vigentes y canceladas por separado, con lo que falta por cobrar. */
    async sales(from: string, to: string): Promise<SalesAggregate> {
      const { rows } = await sql<SalesAggregate>`
        select
          (count(*) filter (where s.status = 'active'))::int as "salesCount",
          coalesce(sum(s.total) filter (where s.status = 'active'), 0)::numeric(14, 2)::text as "salesTotal",
          coalesce(sum(s.total - p.paid) filter (where s.status = 'active'), 0)::numeric(14, 2)::text as "pending",
          (count(*) filter (where s.status = 'cancelled'))::int as "cancelledCount",
          coalesce(sum(s.total) filter (where s.status = 'cancelled'), 0)::numeric(14, 2)::text as "cancelledTotal",
          coalesce(sum(p.paid) filter (where s.status = 'cancelled'), 0)::numeric(14, 2)::text as "refundDue"
        from sales s
        join workdays w on w.id = s.workday_id and ${inPeriod(from, to)}
        cross join lateral (
          select coalesce(sum(pay.amount), 0) as paid from payments pay
          where pay.sale_id = s.id and pay.tenant_id = s.tenant_id and pay.status = 'valid'
        ) p
        where s.tenant_id = ${tenantId} ${ownSales}`.execute(db);
      return rows[0]!;
    },

    /** Unidades y costo de los renglones de ventas vigentes. El costo de cada renglón se redondea a centavos. */
    async items(from: string, to: string): Promise<{ units: string; cost: string }> {
      const { rows } = await sql<{ units: string; cost: string }>`
        select
          coalesce(sum(si.quantity), 0)::numeric(14, 3)::text as units,
          coalesce(sum(round(si.quantity * si.unit_cost, 2)), 0)::numeric(14, 2)::text as cost
        from sale_items si
        join sales s on s.id = si.sale_id and s.tenant_id = si.tenant_id
        join workdays w on w.id = s.workday_id and ${inPeriod(from, to)}
        where si.tenant_id = ${tenantId} and s.status = 'active' ${ownSales}`.execute(db);
      return rows[0]!;
    },

    /** Pagos vigentes recibidos en el periodo (día completo en la zona de la tienda), de ventas vigentes. */
    async collected(
      from: string,
      to: string,
      timezone: string,
    ): Promise<{ cash: string; transfer: string }> {
      const { rows } = await sql<{ method: 'cash' | 'transfer'; amount: string }>`
        select p.method, sum(p.amount)::numeric(14, 2)::text as amount
        from payments p
        join sales s on s.id = p.sale_id and s.tenant_id = p.tenant_id
        where p.tenant_id = ${tenantId} and p.status = 'valid' and s.status = 'active' ${ownSales}
          and p.created_at >= (${from}::date)::timestamp at time zone ${timezone}
          and p.created_at < (${to}::date + 1)::timestamp at time zone ${timezone}
        group by p.method`.execute(db);
      const byMethod = { cash: '0.00', transfer: '0.00' };
      for (const row of rows) byMethod[row.method] = row.amount;
      return byMethod;
    },

    /** Productos con más unidades vendidas; el nombre es el que tenía en la venta más reciente. */
    async topProducts(from: string, to: string, limit: number): Promise<TopProductRow[]> {
      const { rows } = await sql<TopProductRow>`
        select
          si.product_id as "productId",
          (array_agg(si.product_name order by s.created_at desc, si.id))[1] as "name",
          sum(si.quantity)::text as "units",
          sum(si.subtotal)::numeric(14, 2)::text as "amount"
        from sale_items si
        join sales s on s.id = si.sale_id and s.tenant_id = si.tenant_id
        join workdays w on w.id = s.workday_id and ${inPeriod(from, to)}
        where si.tenant_id = ${tenantId} and s.status = 'active' ${ownSales}
        group by si.product_id
        order by sum(si.quantity) desc, sum(si.subtotal) desc, si.product_id
        limit ${limit}`.execute(db);
      return rows;
    },
  };
}
