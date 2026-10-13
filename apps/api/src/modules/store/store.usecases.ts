import { storeSettingsSchema, storeSettingsUpdateSchema, type StoreSettings } from '@pos/shared';
import type { Database } from '../../db/client';
import { parseInput } from '../../validation';
import { recordAudit } from '../audit/audit';
import type { AuthContext } from '../tenancy/context';
import { diffSettings } from './store.domain';
import { createStoreRepository } from './store.repository';

export function getStore(db: Database, ctx: AuthContext): Promise<StoreSettings> {
  return createStoreRepository(db, ctx.tenantId).get();
}

/** Actualiza la configuración y registra la auditoría en la misma transacción. */
export async function updateStore(
  db: Database,
  ctx: AuthContext,
  input: unknown,
): Promise<StoreSettings> {
  const patch = parseInput(storeSettingsUpdateSchema, input);

  return db.transaction().execute(async (trx) => {
    const repository = createStoreRepository(trx, ctx.tenantId);
    const current = await repository.get({ forUpdate: true });
    // Se valida el resultado completo (p. ej. fin posterior al inicio aunque solo cambie uno).
    const next = parseInput(storeSettingsSchema, { ...current, ...patch });
    const changes = diffSettings(current, next);
    if (Object.keys(changes.after).length === 0) return current;

    await repository.save(next);
    await recordAudit(trx, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      entity: 'store_settings',
      entityId: ctx.tenantId,
      action: 'update',
      data: changes,
    });
    return next;
  });
}
