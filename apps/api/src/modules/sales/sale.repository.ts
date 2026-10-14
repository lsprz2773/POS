import { sql } from 'kysely';
import type { Database } from '../../db/client';
import type { RowScope } from '../tenancy/permissions';
import { COUNTS_AS_SOLD } from '../workdays/sold';

/** Producto ofrecido hoy, ya bloqueado para esta transacción, con lo necesario para vender. */
export interface LockedOffer {
  offerId: string;
  productId: string;
  productName: string;
  productActive: boolean;
  allowsFractions: boolean;
  unitPrice: string;
  unitCost: string;
  initialQuantity: string;
  adjustedQuantity: string;
  soldQuantity: string;
}

export interface NewSaleItem {
  offerId: string;
  productId: string;
  productName: string;
  quantity: string;
  unitPrice: string;
  unitCost: string;
  subtotal: string;
}

export interface SaleRow {
  id: string;
  folioNumber: number;
  date: string;
  startTime: string;
  endTime: string;
  createdAt: Date;
  status: 'active' | 'cancelled';
  customerReference: string | null;
  note: string | null;
  total: string;
  settledAt: Date | null;
}

export interface CancellationRow {
  reason: string;
  cancelledAt: Date;
  inventoryRestored: boolean;
}

export interface PaymentRow {
  id: string;
  saleId: string;
  operationId: string;
  method: 'cash' | 'transfer';
  amount: string;
  status: 'valid' | 'voided';
  createdAt: Date;
  voidedAt: Date | null;
  voidReason: string | null;
}

export interface PendingSaleRow {
  id: string;
  folioNumber: number;
  date: string;
  createdAt: Date;
  customerReference: string | null;
  total: string;
  paid: string;
}

export interface SaleSummaryRow extends PendingSaleRow {
  status: 'active' | 'cancelled';
}

export interface SaleItemRow {
  id: string;
  productId: string;
  productName: string;
  quantity: string;
  unitPrice: string;
  subtotal: string;
}

/**
 * Repositorio acotado a una tienda: el tenant se fija al construirlo y ningún método lo recibe,
 * de modo que no se puede leer ni escribir una venta de otra tienda. Con `scope.sellerId` (un vendedor)
 * solo ve y toca las ventas que él registró; las de otra persona se comportan como inexistentes (T104).
 */
export function createSaleRepository(db: Database, tenantId: string, scope: RowScope = {}) {
  const own = scope.sellerId;
  return {
    async findByIdempotencyKey(key: string) {
      return db
        .selectFrom('sales')
        .select(['id', 'request_hash as requestHash'])
        .where('tenant_id', '=', tenantId)
        .where('idempotency_key', '=', key)
        .executeTakeFirst();
    },

    /**
     * Bloquea (FOR UPDATE) los productos pedidos de la jornada, en orden fijo para evitar bloqueos
     * cruzados, y recién entonces lee lo vendido. Son dos consultas a propósito: si el bloqueo y la
     * suma de ventas fueran una sola, una solicitud que esperó el bloqueo usaría un "vendido" anterior
     * a la venta que acaba de confirmarse y vendería de más (RNF-046, T8).
     */
    async lockOffers(workdayId: string, productIds: string[]): Promise<LockedOffer[]> {
      const locked = await db
        .selectFrom('daily_offers')
        .select('id')
        .where('tenant_id', '=', tenantId)
        .where('workday_id', '=', workdayId)
        .where('product_id', 'in', productIds)
        .orderBy('id')
        .forUpdate()
        .execute();
      if (locked.length === 0) return [];

      return db
        .selectFrom('daily_offers as o')
        .innerJoin('products as p', (join) =>
          join.onRef('p.id', '=', 'o.product_id').onRef('p.tenant_id', '=', 'o.tenant_id'),
        )
        .select([
          'o.id as offerId',
          'o.product_id as productId',
          'p.name as productName',
          'p.active as productActive',
          'p.allows_fractions as allowsFractions',
          sql<string>`p.price::text`.as('unitPrice'),
          sql<string>`p.cost::text`.as('unitCost'),
          sql<string>`o.initial_quantity::text`.as('initialQuantity'),
          sql<string>`(select coalesce(sum(a.increment), 0)::text from stock_adjustments a
            where a.daily_offer_id = o.id and a.tenant_id = o.tenant_id)`.as('adjustedQuantity'),
          sql<string>`(select coalesce(sum(si.quantity), 0)::text from sale_items si
            join sales s on s.id = si.sale_id and s.tenant_id = si.tenant_id
            where si.daily_offer_id = o.id and si.tenant_id = o.tenant_id
              and ${COUNTS_AS_SOLD})`.as('soldQuantity'),
        ])
        .where('o.tenant_id', '=', tenantId)
        .where(
          'o.id',
          'in',
          locked.map((row) => row.id),
        )
        .orderBy('o.id')
        .execute();
    },

    /** Siguiente folio de la tienda. Bloquea el contador hasta el fin de la transacción. */
    async nextFolio(): Promise<number> {
      const row = await db
        .insertInto('sale_counters')
        .values({ tenant_id: tenantId, last_folio: 1 })
        .onConflict((conflict) =>
          conflict
            .column('tenant_id')
            .doUpdateSet({ last_folio: sql`sale_counters.last_folio + 1` }),
        )
        .returning('last_folio')
        .executeTakeFirstOrThrow();
      return row.last_folio;
    },

    async insertSale(values: {
      workdayId: string;
      folio: number;
      customerReference: string | null;
      note: string | null;
      total: string;
      createdBy: string;
      idempotencyKey: string;
      requestHash: string;
      createdAt: Date;
      items: NewSaleItem[];
    }): Promise<string> {
      const sale = await db
        .insertInto('sales')
        .values({
          tenant_id: tenantId,
          workday_id: values.workdayId,
          folio: values.folio,
          customer_reference: values.customerReference,
          note: values.note,
          total: values.total,
          created_by: values.createdBy,
          idempotency_key: values.idempotencyKey,
          request_hash: values.requestHash,
          created_at: values.createdAt,
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      await db
        .insertInto('sale_items')
        .values(
          values.items.map((item, index) => ({
            tenant_id: tenantId,
            sale_id: sale.id,
            position: index + 1,
            daily_offer_id: item.offerId,
            product_id: item.productId,
            product_name: item.productName,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            unit_cost: item.unitCost,
            subtotal: item.subtotal,
          })),
        )
        .execute();
      return sale.id;
    },

    async findById(id: string): Promise<
      | {
          sale: SaleRow;
          items: SaleItemRow[];
          payments: PaymentRow[];
          cancellation: CancellationRow | null;
        }
      | undefined
    > {
      const sale = await db
        .selectFrom('sales as s')
        .innerJoin('workdays as w', (join) =>
          join.onRef('w.id', '=', 's.workday_id').onRef('w.tenant_id', '=', 's.tenant_id'),
        )
        .select([
          's.id',
          's.folio as folioNumber',
          sql<string>`w.business_date::text`.as('date'),
          sql<string>`to_char(w.start_time, 'HH24:MI')`.as('startTime'),
          sql<string>`to_char(w.end_time, 'HH24:MI')`.as('endTime'),
          's.created_at as createdAt',
          's.status',
          's.customer_reference as customerReference',
          's.note',
          sql<string>`s.total::text`.as('total'),
          's.settled_at as settledAt',
        ])
        .where('s.tenant_id', '=', tenantId)
        .where('s.id', '=', id)
        .$if(own !== undefined, (query) => query.where('s.created_by', '=', own!))
        .executeTakeFirst();
      if (!sale) return undefined;

      const items = await db
        .selectFrom('sale_items')
        .select([
          'id',
          'product_id as productId',
          'product_name as productName',
          sql<string>`quantity::text`.as('quantity'),
          sql<string>`unit_price::text`.as('unitPrice'),
          sql<string>`subtotal::text`.as('subtotal'),
        ])
        .where('tenant_id', '=', tenantId)
        .where('sale_id', '=', id)
        .orderBy('position')
        .execute();
      const cancellation = await db
        .selectFrom('sale_cancellations')
        .select([
          'reason',
          'cancelled_at as cancelledAt',
          'inventory_restored as inventoryRestored',
        ])
        .where('tenant_id', '=', tenantId)
        .where('sale_id', '=', id)
        .executeTakeFirst();
      return {
        sale: sale as SaleRow,
        items,
        payments: await this.paymentsOf(id),
        cancellation: cancellation ?? null,
      };
    },

    /** Marca la venta como cancelada y guarda el registro de la cancelación. */
    async cancel(values: {
      saleId: string;
      reason: string;
      inventoryRestored: boolean;
      userId: string;
      at: Date;
    }): Promise<void> {
      await db
        .updateTable('sales')
        .set({ status: 'cancelled' })
        .where('tenant_id', '=', tenantId)
        .where('id', '=', values.saleId)
        .execute();
      await db
        .insertInto('sale_cancellations')
        .values({
          tenant_id: tenantId,
          sale_id: values.saleId,
          reason: values.reason,
          inventory_restored: values.inventoryRestored,
          cancelled_by: values.userId,
          cancelled_at: values.at,
        })
        .execute();
    },

    /** Fecha de negocio de la jornada de la venta. */
    async saleDate(saleId: string): Promise<string | undefined> {
      const row = await db
        .selectFrom('sales as s')
        .innerJoin('workdays as w', (join) =>
          join.onRef('w.id', '=', 's.workday_id').onRef('w.tenant_id', '=', 's.tenant_id'),
        )
        .select(sql<string>`w.business_date::text`.as('date'))
        .where('s.tenant_id', '=', tenantId)
        .where('s.id', '=', saleId)
        .executeTakeFirst();
      return row?.date;
    },

    async paymentsOf(saleId: string): Promise<PaymentRow[]> {
      const rows = await db
        .selectFrom('payments')
        .select([
          'id',
          'sale_id as saleId',
          'operation_id as operationId',
          'method',
          sql<string>`amount::text`.as('amount'),
          'status',
          'created_at as createdAt',
          'voided_at as voidedAt',
          'void_reason as voidReason',
        ])
        .where('tenant_id', '=', tenantId)
        .where('sale_id', '=', saleId)
        .orderBy('created_at')
        .orderBy('method')
        .execute();
      return rows as PaymentRow[];
    },

    /** Bloquea la venta mientras dure la transacción: los pagos de una venta se registran de uno en uno. */
    async lockSale(id: string) {
      return db
        .selectFrom('sales')
        .select([
          'id',
          'folio as folioNumber',
          'status',
          sql<string>`total::text`.as('total'),
          'settled_at as settledAt',
        ])
        .where('tenant_id', '=', tenantId)
        .where('id', '=', id)
        .$if(own !== undefined, (query) => query.where('created_by', '=', own!))
        .forUpdate()
        .executeTakeFirst();
    },

    /** Suma de los pagos vigentes de la venta. */
    async paidAmount(saleId: string): Promise<string> {
      const row = await db
        .selectFrom('payments')
        .select(sql<string>`coalesce(sum(amount), 0)::text`.as('paid'))
        .where('tenant_id', '=', tenantId)
        .where('sale_id', '=', saleId)
        .where('status', '=', 'valid')
        .executeTakeFirstOrThrow();
      return row.paid;
    },

    /** Renglones de la operación que ya usó esta llave de idempotencia, si existe. */
    async findPaymentsByKey(key: string) {
      return db
        .selectFrom('payments')
        .select(['sale_id as saleId', 'request_hash as requestHash'])
        .where('tenant_id', '=', tenantId)
        .where('idempotency_key', '=', key)
        .limit(1)
        .executeTakeFirst();
    },

    async insertPayments(values: {
      saleId: string;
      lines: { method: 'cash' | 'transfer'; amount: string }[];
      createdBy: string;
      idempotencyKey: string;
      requestHash: string;
      createdAt: Date;
      operationId: string;
    }): Promise<void> {
      await db
        .insertInto('payments')
        .values(
          values.lines.map((line) => ({
            tenant_id: tenantId,
            sale_id: values.saleId,
            operation_id: values.operationId,
            method: line.method,
            amount: line.amount,
            created_by: values.createdBy,
            idempotency_key: values.idempotencyKey,
            request_hash: values.requestHash,
            created_at: values.createdAt,
          })),
        )
        .execute();
    },

    async findPayment(id: string, options: { forUpdate?: boolean } = {}) {
      let query = db
        .selectFrom('payments')
        .select([
          'id',
          'sale_id as saleId',
          'method',
          sql<string>`amount::text`.as('amount'),
          'status',
        ])
        .where('tenant_id', '=', tenantId)
        .where('id', '=', id)
        .$if(own !== undefined, (query) =>
          query.where(
            sql<boolean>`exists (select 1 from sales s where s.id = payments.sale_id
              and s.tenant_id = payments.tenant_id and s.created_by = ${own})`,
          ),
        );
      if (options.forUpdate) query = query.forUpdate();
      return query.executeTakeFirst();
    },

    async voidPayment(id: string, reason: string, userId: string, at: Date): Promise<void> {
      await db
        .updateTable('payments')
        .set({ status: 'voided', void_reason: reason, voided_at: at, voided_by: userId })
        .where('tenant_id', '=', tenantId)
        .where('id', '=', id)
        .execute();
    },

    async setSettledAt(saleId: string, settledAt: Date | null): Promise<void> {
      await db
        .updateTable('sales')
        .set({ settled_at: settledAt })
        .where('tenant_id', '=', tenantId)
        .where('id', '=', saleId)
        .execute();
    },

    /** Historial: ventas de cualquier día y estado, de la más nueva a la más antigua. */
    async list(filter: {
      from?: string;
      to?: string;
      status?: 'active' | 'cancelled';
      collection?: 'pending' | 'partial' | 'paid' | 'unpaid';
      q?: string;
      limit: number;
      offset: number;
    }): Promise<{ items: SaleSummaryRow[]; total: number }> {
      const paid = sql<string>`coalesce((select sum(p.amount) from payments p
        where p.sale_id = s.id and p.tenant_id = s.tenant_id and p.status = 'valid'), 0)`;
      const scoped = () => {
        let query = db
          .selectFrom('sales as s')
          .innerJoin('workdays as w', (join) =>
            join.onRef('w.id', '=', 's.workday_id').onRef('w.tenant_id', '=', 's.tenant_id'),
          )
          .where('s.tenant_id', '=', tenantId)
          .$if(own !== undefined, (qb) => qb.where('s.created_by', '=', own!));
        if (filter.from) query = query.where(sql<boolean>`w.business_date >= ${filter.from}::date`);
        if (filter.to) query = query.where(sql<boolean>`w.business_date <= ${filter.to}::date`);
        if (filter.status) query = query.where('s.status', '=', filter.status);
        if (filter.collection) {
          query = query.where('s.status', '=', 'active');
          query = query.where(
            filter.collection === 'paid'
              ? sql<boolean>`s.total <= ${paid}`
              : filter.collection === 'unpaid'
                ? sql<boolean>`s.total > ${paid}`
                : filter.collection === 'partial'
                  ? sql<boolean>`${paid} > 0 and s.total > ${paid}`
                  : sql<boolean>`${paid} = 0 and s.total > 0`,
          );
        }
        if (filter.q) {
          const folio = /^(?:v-?)?(\d{1,9})$/i.exec(filter.q)?.[1];
          const like = `%${filter.q.replace(/[\\%_]/g, '\\$&')}%`;
          query = query.where(
            folio
              ? sql<boolean>`(s.folio = ${Number(folio)} or s.customer_reference ilike ${like})`
              : sql<boolean>`s.customer_reference ilike ${like}`,
          );
        }
        return query;
      };

      const [rows, count] = await Promise.all([
        scoped()
          .select([
            's.id',
            's.folio as folioNumber',
            sql<string>`w.business_date::text`.as('date'),
            's.created_at as createdAt',
            's.customer_reference as customerReference',
            's.status',
            sql<string>`s.total::text`.as('total'),
            sql<string>`${paid}::text`.as('paid'),
          ])
          // El folio crece con cada venta: orden estable, de la más nueva a la más antigua.
          .orderBy('s.folio', 'desc')
          .limit(filter.limit)
          .offset(filter.offset)
          .execute(),
        scoped()
          .select((eb) => eb.fn.countAll<string>().as('total'))
          .executeTakeFirstOrThrow(),
      ]);
      return { items: rows as SaleSummaryRow[], total: Number(count.total) };
    },

    /** Ventas activas con saldo mayor que cero, de cualquier día (RF-073, RF-080). */
    async listPending(filter: {
      from?: string;
      to?: string;
      limit: number;
      offset: number;
    }): Promise<{ items: PendingSaleRow[]; total: number; totalBalance: string }> {
      const paid = sql<string>`coalesce((select sum(p.amount) from payments p
        where p.sale_id = s.id and p.tenant_id = s.tenant_id and p.status = 'valid'), 0)`;
      const scoped = () => {
        let query = db
          .selectFrom('sales as s')
          .innerJoin('workdays as w', (join) =>
            join.onRef('w.id', '=', 's.workday_id').onRef('w.tenant_id', '=', 's.tenant_id'),
          )
          .where('s.tenant_id', '=', tenantId)
          .where('s.status', '=', 'active')
          .where(sql<boolean>`s.total > ${paid}`)
          .$if(own !== undefined, (qb) => qb.where('s.created_by', '=', own!));
        if (filter.from) query = query.where(sql<boolean>`w.business_date >= ${filter.from}::date`);
        if (filter.to) query = query.where(sql<boolean>`w.business_date <= ${filter.to}::date`);
        return query;
      };

      const [rows, totals] = await Promise.all([
        scoped()
          .select([
            's.id',
            's.folio as folioNumber',
            sql<string>`w.business_date::text`.as('date'),
            's.created_at as createdAt',
            's.customer_reference as customerReference',
            sql<string>`s.total::text`.as('total'),
            sql<string>`${paid}::text`.as('paid'),
          ])
          .orderBy('s.created_at', 'desc')
          .orderBy('s.id')
          .limit(filter.limit)
          .offset(filter.offset)
          .execute(),
        scoped()
          .select([
            (eb) => eb.fn.countAll<string>().as('total'),
            sql<string>`coalesce(sum(s.total - ${paid}), 0)::text`.as('totalBalance'),
          ])
          .executeTakeFirstOrThrow(),
      ]);
      return { items: rows, total: Number(totals.total), totalBalance: totals.totalBalance };
    },
  };
}
