import { sql } from 'kysely';
import { toHHMM, type ListWorkdaysQuery } from '@pos/shared';
import type { Database } from '../../db/client';
import { COUNTS_AS_SOLD } from './sold';

export interface WorkdayRow {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
}

export interface OfferRow {
  id: string;
  productId: string;
  productName: string;
  productCode: string | null;
  productActive: boolean;
  unit: string;
  allowsFractions: boolean;
  /** Precio de venta vigente en el catálogo; el de cada venta se congela al vender. */
  price: string;
  initialQuantity: string;
  adjustedQuantity: string;
}

export interface AdjustmentRow {
  id: string;
  offerId: string;
  increment: string;
  reason: string;
  userEmail: string;
  createdAt: string;
}

export interface WorkdaySummaryRow extends WorkdayRow {
  products: number;
  initialQuantity: string;
  adjustedQuantity: string;
  soldQuantity: string;
}

const toWorkday = (row: {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
}): WorkdayRow => ({
  id: row.id,
  date: row.date,
  startTime: toHHMM(row.start_time),
  endTime: toHHMM(row.end_time),
});

/**
 * Repositorio acotado a una tienda: el tenant se fija al construirlo y ningún método lo recibe.
 * La fecha de negocio viaja como texto AAAA-MM-DD para que la zona horaria del servidor no la mueva.
 */
export function createWorkdayRepository(db: Database, tenantId: string) {
  const workdayColumns = [
    'id',
    sql<string>`business_date::text`.as('date'),
    sql<string>`start_time::text`.as('start_time'),
    sql<string>`end_time::text`.as('end_time'),
  ] as const;

  const offerQuery = () =>
    db
      .selectFrom('daily_offers as o')
      .innerJoin('products as p', (join) =>
        join.onRef('p.id', '=', 'o.product_id').onRef('p.tenant_id', '=', 'o.tenant_id'),
      )
      .select([
        'o.id',
        'o.product_id as productId',
        'p.name as productName',
        'p.code as productCode',
        'p.active as productActive',
        'p.unit',
        'p.allows_fractions as allowsFractions',
        sql<string>`p.price::text`.as('price'),
        sql<string>`o.initial_quantity::text`.as('initialQuantity'),
        sql<string>`(select coalesce(sum(a.increment), 0)::text from stock_adjustments a
          where a.daily_offer_id = o.id and a.tenant_id = o.tenant_id)`.as('adjustedQuantity'),
      ])
      .where('o.tenant_id', '=', tenantId);

  return {
    async findByDate(date: string, options: { forUpdate?: boolean } = {}) {
      let query = db
        .selectFrom('workdays')
        .select(workdayColumns)
        .where('tenant_id', '=', tenantId)
        .where(sql<boolean>`business_date = ${date}::date`);
      if (options.forUpdate) query = query.forUpdate();
      const row = await query.executeTakeFirst();
      return row ? toWorkday(row) : undefined;
    },

    /** Crea la jornada; si otra solicitud la creó antes, devuelve `undefined`. */
    async insert(date: string, startTime: string, endTime: string) {
      const row = await db
        .insertInto('workdays')
        .values({
          tenant_id: tenantId,
          business_date: sql`${date}::date`,
          start_time: sql`${startTime}::time`,
          end_time: sql`${endTime}::time`,
        })
        .onConflict((conflict) => conflict.columns(['tenant_id', 'business_date']).doNothing())
        .returning(workdayColumns)
        .executeTakeFirst();
      return row ? toWorkday(row) : undefined;
    },

    async updateHours(id: string, hours: { startTime: string; endTime: string }) {
      await db
        .updateTable('workdays')
        .set({
          start_time: sql`${hours.startTime}::time`,
          end_time: sql`${hours.endTime}::time`,
        })
        .where('tenant_id', '=', tenantId)
        .where('id', '=', id)
        .execute();
    },

    async offersOf(workdayId: string): Promise<OfferRow[]> {
      return offerQuery()
        .where('o.workday_id', '=', workdayId)
        .orderBy(sql`lower(p.name)`)
        .orderBy('o.id')
        .execute();
    },

    async findOffer(
      workdayId: string,
      offerId: string,
      options: { forUpdate?: boolean } = {},
    ): Promise<OfferRow | undefined> {
      let query = offerQuery().where('o.workday_id', '=', workdayId).where('o.id', '=', offerId);
      if (options.forUpdate) query = query.forUpdate('o');
      return query.executeTakeFirst();
    },

    async hasOfferForProduct(workdayId: string, productId: string): Promise<boolean> {
      const row = await db
        .selectFrom('daily_offers')
        .select('id')
        .where('tenant_id', '=', tenantId)
        .where('workday_id', '=', workdayId)
        .where('product_id', '=', productId)
        .executeTakeFirst();
      return row !== undefined;
    },

    async insertOffer(workdayId: string, productId: string, quantity: string): Promise<string> {
      const row = await db
        .insertInto('daily_offers')
        .values({
          tenant_id: tenantId,
          workday_id: workdayId,
          product_id: productId,
          initial_quantity: quantity,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return row.id;
    },

    /** Quita el producto del día junto con sus aumentos; la auditoría conserva el rastro. */
    async deleteOffer(offerId: string): Promise<void> {
      await db
        .deleteFrom('stock_adjustments')
        .where('tenant_id', '=', tenantId)
        .where('daily_offer_id', '=', offerId)
        .execute();
      await db
        .deleteFrom('daily_offers')
        .where('tenant_id', '=', tenantId)
        .where('id', '=', offerId)
        .execute();
    },

    async insertAdjustment(offerId: string, increment: string, reason: string, userId: string) {
      await db
        .insertInto('stock_adjustments')
        .values({
          tenant_id: tenantId,
          daily_offer_id: offerId,
          increment,
          reason,
          user_id: userId,
        })
        .execute();
    },

    async adjustmentsOf(offerIds: string[]): Promise<AdjustmentRow[]> {
      if (offerIds.length === 0) return [];
      const rows = await db
        .selectFrom('stock_adjustments as a')
        .innerJoin('users as u', 'u.id', 'a.user_id')
        .select([
          'a.id',
          'a.daily_offer_id as offerId',
          sql<string>`a.increment::text`.as('increment'),
          'a.reason',
          'u.email as userEmail',
          'a.created_at as createdAt',
        ])
        .where('a.tenant_id', '=', tenantId)
        .where('a.daily_offer_id', 'in', offerIds)
        .orderBy('a.created_at')
        .orderBy('a.id')
        .execute();
      return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
    },

    /** Datos del producto necesarios para ofrecerlo; undefined si no existe en esta tienda. */
    async findProduct(productId: string) {
      return db
        .selectFrom('products')
        .select(['id', 'name', 'active', 'allows_fractions as allowsFractions'])
        .where('tenant_id', '=', tenantId)
        .where('id', '=', productId)
        .executeTakeFirst();
    },

    /** Si el producto del día tiene alguna venta, vigente o cancelada: el historial no se pierde. */
    async hasSales(offerId: string): Promise<boolean> {
      const row = await db
        .selectFrom('sale_items')
        .select('id')
        .where('tenant_id', '=', tenantId)
        .where('daily_offer_id', '=', offerId)
        .limit(1)
        .executeTakeFirst();
      return row !== undefined;
    },

    /** Cantidad vendida por disponibilidad: renglones de ventas no canceladas. */
    async soldByOffer(offerIds: string[]): Promise<Map<string, string>> {
      const sold = new Map(offerIds.map((id) => [id, '0']));
      if (offerIds.length === 0) return sold;
      const rows = await db
        .selectFrom('sale_items as si')
        .innerJoin('sales as s', (join) =>
          join.onRef('s.id', '=', 'si.sale_id').onRef('s.tenant_id', '=', 'si.tenant_id'),
        )
        .select(['si.daily_offer_id as offerId', sql<string>`sum(si.quantity)::text`.as('sold')])
        .where('si.tenant_id', '=', tenantId)
        .where(COUNTS_AS_SOLD)
        .where('si.daily_offer_id', 'in', offerIds)
        .groupBy('si.daily_offer_id')
        .execute();
      for (const row of rows) sold.set(row.offerId, row.sold);
      return sold;
    },

    async list(filter: ListWorkdaysQuery) {
      const scoped = () => {
        let query = db.selectFrom('workdays as w').where('w.tenant_id', '=', tenantId);
        if (filter.from) query = query.where(sql<boolean>`w.business_date >= ${filter.from}::date`);
        if (filter.to) query = query.where(sql<boolean>`w.business_date <= ${filter.to}::date`);
        return query;
      };

      const [rows, count] = await Promise.all([
        scoped()
          .select([
            'w.id',
            sql<string>`w.business_date::text`.as('date'),
            sql<string>`w.start_time::text`.as('start_time'),
            sql<string>`w.end_time::text`.as('end_time'),
            sql<number>`(select count(*)::int from daily_offers o where o.workday_id = w.id)`.as(
              'products',
            ),
            sql<string>`(select coalesce(sum(o.initial_quantity), 0)::text from daily_offers o
              where o.workday_id = w.id)`.as('initialQuantity'),
            sql<string>`(select coalesce(sum(a.increment), 0)::text from stock_adjustments a
              join daily_offers o on o.id = a.daily_offer_id where o.workday_id = w.id)`.as(
              'adjustedQuantity',
            ),
            sql<string>`(select coalesce(sum(si.quantity), 0)::text from sale_items si
              join sales s on s.id = si.sale_id and s.tenant_id = si.tenant_id
              join daily_offers o on o.id = si.daily_offer_id
              where o.workday_id = w.id and ${COUNTS_AS_SOLD})`.as('soldQuantity'),
          ])
          .orderBy('w.business_date', 'desc')
          .limit(filter.limit)
          .offset(filter.offset)
          .execute(),
        scoped()
          .select((eb) => eb.fn.countAll<string>().as('total'))
          .executeTakeFirstOrThrow(),
      ]);

      const items: WorkdaySummaryRow[] = rows.map((row) => ({
        ...toWorkday(row),
        products: row.products,
        initialQuantity: row.initialQuantity,
        adjustedQuantity: row.adjustedQuantity,
        soldQuantity: row.soldQuantity,
      }));
      return { items, total: Number(count.total) };
    },
  };
}
