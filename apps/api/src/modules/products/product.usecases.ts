import {
  createProductSchema,
  listProductsQuerySchema,
  updateProductSchema,
  type Product,
  type ProductList,
} from '@pos/shared';
import { z } from 'zod';
import type { Database } from '../../db/client';
import { AppError } from '../../errors';
import { parseInput } from '../../validation';
import { recordAudit } from '../audit/audit';
import type { AuthContext } from '../tenancy/context';
import { auditActionFor, diffProduct } from './product.domain';
import { createProductRepository } from './product.repository';

const notFound = () => new AppError(404, 'not_found', 'Este producto ya no está disponible.');

const CODE_TAKEN = 'Ya existe un producto con ese código.';

/** Un identificador mal formado se trata igual que uno inexistente (no revela nada). */
function parseProductId(id: string): string {
  const result = z.uuid().safeParse(id);
  if (!result.success) throw notFound();
  return result.data;
}

/** Traduce la violación del índice único del código interno a un error entendible. */
async function withCodeConflict<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505' &&
      'constraint' in error &&
      error.constraint === 'products_tenant_code_key'
    ) {
      throw new AppError(409, 'conflict', CODE_TAKEN, { code: CODE_TAKEN });
    }
    throw error;
  }
}

export async function listProducts(
  db: Database,
  ctx: AuthContext,
  query: unknown,
): Promise<ProductList> {
  const filter = parseInput(listProductsQuerySchema, query);
  const { items, total } = await createProductRepository(db, ctx.tenantId).list(filter);
  return { items, total, limit: filter.limit, offset: filter.offset };
}

export async function getProduct(db: Database, ctx: AuthContext, id: string): Promise<Product> {
  const product = await createProductRepository(db, ctx.tenantId).findById(parseProductId(id));
  if (!product) throw notFound();
  return product;
}

/** Crea el producto y su evento de auditoría en la misma transacción (RF-118, sección 6.12). */
export async function createProduct(
  db: Database,
  ctx: AuthContext,
  input: unknown,
): Promise<Product> {
  const data = parseInput(createProductSchema, input);

  return withCodeConflict(() =>
    db.transaction().execute(async (trx) => {
      const product = await createProductRepository(trx, ctx.tenantId).insert({
        name: data.name,
        price: data.price,
        cost: data.cost,
        description: data.description ?? null,
        category: data.category ?? null,
        code: data.code ?? null,
        unit: data.unit ?? 'pieza',
        notes: data.notes ?? null,
      });
      await recordAudit(trx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        entity: 'product',
        entityId: product.id,
        action: 'create',
        data: {
          name: product.name,
          price: product.price,
          cost: product.cost,
          code: product.code,
          unit: product.unit,
        },
      });
      return product;
    }),
  );
}

/**
 * Edita, activa o desactiva un producto. Exige la versión que la persona vio: si otra sesión
 * lo cambió antes, responde 409 en lugar de sobrescribir en silencio (sección 6.3).
 */
export async function updateProduct(
  db: Database,
  ctx: AuthContext,
  id: string,
  input: unknown,
): Promise<Product> {
  const productId = parseProductId(id);
  const { version, ...changes } = parseInput(updateProductSchema, input);

  return withCodeConflict(() =>
    db.transaction().execute(async (trx) => {
      const repository = createProductRepository(trx, ctx.tenantId);
      const current = await repository.findById(productId, { forUpdate: true });
      if (!current) throw notFound();
      if (current.version !== version) {
        throw new AppError(
          409,
          'conflict',
          'Este producto cambió mientras lo editabas. Vuelve a cargarlo y aplica tu cambio de nuevo.',
        );
      }

      const diff = diffProduct(current, changes);
      if (Object.keys(diff.after).length === 0) return current;

      const updated = await repository.update(productId, diff.after);
      await recordAudit(trx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        entity: 'product',
        entityId: productId,
        action: auditActionFor(diff),
        data: diff,
      });
      return updated;
    }),
  );
}
