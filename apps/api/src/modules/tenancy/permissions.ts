import { can, isOwnRowsOnly, type Permission } from '@pos/shared';
import { AppError } from '../../errors';
import type { AuthContext } from './context';

/** Rechaza la operación si el rol de la persona no tiene el permiso (T103). Se llama en cada caso de uso. */
export function assertCan(ctx: AuthContext, permission: Permission): void {
  if (!can(ctx.role, permission)) {
    throw new AppError(403, 'forbidden', 'No tienes permiso para hacer esto.');
  }
}

/** Alcance por fila (T104): el vendedor solo ve y opera lo que él registró; el propietario ve toda la tienda. */
export interface RowScope {
  sellerId?: string;
}

export function rowScope(ctx: AuthContext): RowScope {
  return isOwnRowsOnly(ctx.role) ? { sellerId: ctx.userId } : {};
}

/**
 * Alcance con el filtro `sellerId` de una consulta (fase 10d): el propietario puede pedir las filas de una
 * persona; cualquiera puede pedir las suyas; un vendedor no puede pedir las de otra (403).
 */
export function scopeFor(ctx: AuthContext, sellerId: string | undefined): RowScope {
  if (sellerId === undefined) return rowScope(ctx);
  if (sellerId !== ctx.userId) assertCan(ctx, 'team:report');
  return { sellerId };
}
