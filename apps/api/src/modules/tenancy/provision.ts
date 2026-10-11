import type { Database } from '../../db/client';
import { recordAudit } from '../audit/audit';

export interface ProvisionInput {
  storeName: string;
  email: string;
  /** Identificador del usuario en el proveedor de identidad (`sub` de Cognito, o `local:<correo>`). */
  identitySubject: string;
}

export class ProvisionError extends Error {}

/** Alta manual de una tienda con su propietario (no hay autoregistro público). */
export async function provisionTenant(db: Database, input: ProvisionInput) {
  const email = input.email.trim().toLowerCase();
  const storeName = input.storeName.trim();
  if (!storeName || storeName.length > 100) throw new ProvisionError('Nombre de tienda inválido.');
  if (!email.includes('@')) throw new ProvisionError('Correo inválido.');

  return db.transaction().execute(async (trx) => {
    const existing = await trx
      .selectFrom('users')
      .select('id')
      .where((eb) =>
        eb.or([
          eb(eb.fn('lower', ['email']), '=', email),
          eb('identity_subject', '=', input.identitySubject),
        ]),
      )
      .executeTakeFirst();
    if (existing) throw new ProvisionError('Ya existe un usuario con ese correo o identidad.');

    const tenant = await trx
      .insertInto('tenants')
      .values({ name: storeName })
      .returning('id')
      .executeTakeFirstOrThrow();
    await trx.insertInto('store_settings').values({ tenant_id: tenant.id }).execute();
    const user = await trx
      .insertInto('users')
      .values({ email, identity_subject: input.identitySubject })
      .returning('id')
      .executeTakeFirstOrThrow();
    await trx
      .insertInto('memberships')
      .values({ tenant_id: tenant.id, user_id: user.id, role: 'owner' })
      .execute();
    await recordAudit(trx, {
      tenantId: tenant.id,
      actorUserId: null,
      entity: 'tenant',
      entityId: tenant.id,
      action: 'provision',
      data: { ownerUserId: user.id },
    });
    return { tenantId: tenant.id, userId: user.id };
  });
}
