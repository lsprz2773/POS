import { AppError } from '../../errors';
import type { Database } from '../../db/client';

/** Contexto autorizado de una solicitud. Se deriva solo de la identidad autenticada. */
export interface AuthContext {
  userId: string;
  email: string;
  tenantId: string;
  tenantName: string;
  role: 'owner';
}

/** Busca usuario, tienda y rol a partir del sujeto verificado por el proveedor de identidad. */
export async function findAuthContext(
  db: Database,
  identitySubject: string,
): Promise<{ context: AuthContext; tenantActive: boolean } | undefined> {
  const row = await db
    .selectFrom('users')
    .innerJoin('memberships', 'memberships.user_id', 'users.id')
    .innerJoin('tenants', 'tenants.id', 'memberships.tenant_id')
    .select([
      'users.id as userId',
      'users.email',
      'tenants.id as tenantId',
      'tenants.name as tenantName',
      'tenants.status',
      'memberships.role',
    ])
    .where('users.identity_subject', '=', identitySubject)
    .executeTakeFirst();
  if (!row) return undefined;
  return {
    context: {
      userId: row.userId,
      email: row.email,
      tenantId: row.tenantId,
      tenantName: row.tenantName,
      role: row.role as 'owner',
    },
    tenantActive: row.status === 'active',
  };
}

/** Igual que `findAuthContext`, pero bloquea el acceso operativo si falta la tienda o está desactivada. */
export async function requireAuthContext(
  db: Database,
  identitySubject: string,
): Promise<AuthContext> {
  const found = await findAuthContext(db, identitySubject);
  if (!found) {
    throw new AppError(
      403,
      'store_not_configured',
      'Tu cuenta aún no tiene una tienda configurada. Contacta al administrador.',
    );
  }
  if (!found.tenantActive) {
    throw new AppError(403, 'tenant_disabled', 'Esta tienda está desactivada.');
  }
  return found.context;
}
