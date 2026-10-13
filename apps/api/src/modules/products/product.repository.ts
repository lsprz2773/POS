import { sql, type Selectable } from 'kysely';
import { type ListProductsQuery, type Product } from '@pos/shared';
import type { Database } from '../../db/client';
import type { Products } from '../../db/types';
import { escapeLike, type ProductChanges } from './product.domain';

type ProductRow = Selectable<Products>;

export const toProduct = (row: ProductRow): Product => ({
  id: row.id,
  name: row.name,
  description: row.description,
  category: row.category,
  code: row.code,
  unit: row.unit,
  allowsFractions: row.allows_fractions,
  price: row.price,
  cost: row.cost,
  notes: row.notes,
  active: row.active,
  version: row.version,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

export interface NewProduct {
  name: string;
  price: string;
  cost: string;
  description: string | null;
  category: string | null;
  code: string | null;
  unit: string;
  notes: string | null;
}

/**
 * Repositorio acotado a una tienda: el tenant se fija al construirlo y ningún método lo recibe,
 * así que un producto de otra tienda nunca se puede leer ni modificar (RF-013, RF-014).
 */
export function createProductRepository(db: Database, tenantId: string) {
  return {
    async insert(values: NewProduct): Promise<Product> {
      const row = await db
        .insertInto('products')
        .values({ ...values, tenant_id: tenantId })
        .returningAll()
        .executeTakeFirstOrThrow();
      return toProduct(row);
    },

    async findById(
      id: string,
      options: { forUpdate?: boolean } = {},
    ): Promise<Product | undefined> {
      let query = db
        .selectFrom('products')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('id', '=', id);
      if (options.forUpdate) query = query.forUpdate();
      const row = await query.executeTakeFirst();
      return row ? toProduct(row) : undefined;
    },

    async list(filter: ListProductsQuery): Promise<{ items: Product[]; total: number }> {
      const scoped = () => {
        let query = db.selectFrom('products').where('tenant_id', '=', tenantId);
        if (filter.status !== 'all') query = query.where('active', '=', filter.status === 'active');
        if (filter.q) {
          const pattern = `%${escapeLike(filter.q)}%`;
          query = query.where((eb) =>
            eb.or([eb('name', 'ilike', pattern), eb('code', 'ilike', pattern)]),
          );
        }
        return query;
      };

      const [rows, count] = await Promise.all([
        scoped()
          .selectAll()
          .orderBy(sql`lower(name)`)
          .orderBy('id')
          .limit(filter.limit)
          .offset(filter.offset)
          .execute(),
        scoped()
          .select((eb) => eb.fn.countAll<string>().as('total'))
          .executeTakeFirstOrThrow(),
      ]);
      return { items: rows.map(toProduct), total: Number(count.total) };
    },

    /** Aplica los cambios y sube la versión. Los campos no incluidos no se tocan. */
    async update(id: string, changes: ProductChanges): Promise<Product> {
      const row = await db
        .updateTable('products')
        .set({ ...changes, version: sql`version + 1` })
        .where('tenant_id', '=', tenantId)
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();
      return toProduct(row);
    },
  };
}
