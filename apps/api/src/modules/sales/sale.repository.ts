import { sql } from 'kysely';
import type { Database } from '../../db/client';

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
 * de modo que no se puede leer ni escribir una venta de otra tienda.
 */
export function createSaleRepository(db: Database, tenantId: string) {
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
              and s.status = 'active')`.as('soldQuantity'),
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

    async findById(id: string): Promise<{ sale: SaleRow; items: SaleItemRow[] } | undefined> {
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
        ])
        .where('s.tenant_id', '=', tenantId)
        .where('s.id', '=', id)
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
      return { sale: sale as SaleRow, items };
    },
  };
}
