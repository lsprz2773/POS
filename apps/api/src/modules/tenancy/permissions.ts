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
