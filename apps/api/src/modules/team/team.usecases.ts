import {
  createSellerSchema,
  SELLER_LIMIT,
  updateSellerSchema,
  type TeamList,
  type TeamMember,
} from '@pos/shared';
import { z } from 'zod';
import type { Database } from '../../db/client';
import { AppError } from '../../errors';
import { parseInput } from '../../validation';
import { recordAudit } from '../audit/audit';
import { UserExistsError, WeakPasswordError, type UserDirectory } from '../auth/identity-provider';
import type { AuthContext } from '../tenancy/context';
import { assertCan } from '../tenancy/permissions';
import { createTeamRepository, type MemberRow } from './team.repository';

const MEMBER_NOT_FOUND = () => new AppError(404, 'not_found', 'Esa persona ya no está disponible.');
const EMAIL_TAKEN = 'Ya existe una cuenta con ese correo.';
const LIMIT_REACHED = () =>
  new AppError(
    409,
    'conflict',
    `Ya tienes ${SELLER_LIMIT} vendedores activos. Da de baja a uno para agregar otro.`,
  );

const toMember = (row: MemberRow): TeamMember => ({
  id: row.userId,
  email: row.email,
  displayName: row.displayName,
  role: row.role,
  status: row.status,
  createdAt: row.createdAt.toISOString(),
});

export async function listTeam(db: Database, ctx: AuthContext): Promise<TeamList> {
  assertCan(ctx, 'team:manage');
  const rows = await createTeamRepository(db, ctx.tenantId).list();
  return {
    items: rows.map(toMember),
    activeSellers: rows.filter((row) => row.role === 'seller' && row.status === 'active').length,
    sellerLimit: SELLER_LIMIT,
  };
}

const isUniqueEmail = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === '23505' &&
  'constraint' in error &&
  (error.constraint === 'users_email_lower_key' ||
    error.constraint === 'users_identity_subject_key');

/**
 * Da de alta a un vendedor (RF-134, T107): crea la cuenta en el proveedor de identidad con la contraseña
 * que registró el propietario y, en una transacción, su usuario, su membresía y la auditoría. Si la base
 * falla después de crear la cuenta, la cuenta se borra. La contraseña no se guarda ni se registra (T108).
 */
export async function createSeller(
  db: Database,
  ctx: AuthContext,
  directory: UserDirectory,
  input: unknown,
): Promise<TeamMember> {
  assertCan(ctx, 'team:manage');
  const data = parseInput(createSellerSchema, input);
  const repository = createTeamRepository(db, ctx.tenantId);

  if (await repository.emailTaken(data.email)) {
    throw new AppError(409, 'conflict', EMAIL_TAKEN, { email: EMAIL_TAKEN });
  }
  if ((await repository.countActiveSellers()) >= SELLER_LIMIT) throw LIMIT_REACHED();

  let subject: string;
  try {
    ({ subject } = await directory.createUser(data.email, data.password));
  } catch (error) {
    if (error instanceof UserExistsError) {
      throw new AppError(409, 'conflict', EMAIL_TAKEN, { email: EMAIL_TAKEN });
    }
    if (error instanceof WeakPasswordError) {
      const message = 'La contraseña no cumple la política de seguridad.';
      throw new AppError(400, 'validation_error', 'Revisa los datos ingresados.', {
        password: message,
      });
    }
    throw error;
  }

  try {
    const row = await db.transaction().execute(async (trx) => {
      const team = createTeamRepository(trx, ctx.tenantId);
      await team.lockTenant();
      if ((await team.countActiveSellers()) >= SELLER_LIMIT) throw LIMIT_REACHED();
      const userId = await team.insertSeller({
        email: data.email,
        displayName: data.displayName,
        identitySubject: subject,
        invitedBy: ctx.userId,
      });
      await recordAudit(trx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        entity: 'team_member',
        entityId: userId,
        action: 'create',
        data: { email: data.email, displayName: data.displayName, role: 'seller' },
      });
      return (await team.find(userId))!;
    });
    return toMember(row);
  } catch (error) {
    await directory.deleteUser(subject).catch(() => undefined);
    if (isUniqueEmail(error)) {
      throw new AppError(409, 'conflict', EMAIL_TAKEN, { email: EMAIL_TAKEN });
    }
    throw error;
  }
}

/**
 * Cambia el nombre de un vendedor o lo da de baja y lo reactiva (RF-135, T109). La baja bloquea su acceso
 * en la base en el acto (su siguiente petición ya es rechazada) y además deshabilita su cuenta y cierra
 * sus sesiones en el proveedor de identidad. Su historial se conserva.
 */
export async function updateSeller(
  db: Database,
  ctx: AuthContext,
  directory: UserDirectory,
  userIdParam: string,
  input: unknown,
): Promise<TeamMember> {
  assertCan(ctx, 'team:manage');
  const parsedId = z.uuid().safeParse(userIdParam);
  if (!parsedId.success) throw MEMBER_NOT_FOUND();
  const changes = parseInput(updateSellerSchema, input);

  // Reactivar: primero el proveedor (una cuenta deshabilitada no puede iniciar sesión) y luego la base.
  const reactivating = await db.transaction().execute(async (trx) => {
    const target = await createTeamRepository(trx, ctx.tenantId).find(parsedId.data);
    if (!target) throw MEMBER_NOT_FOUND();
    if (target.role !== 'seller') {
      throw new AppError(409, 'conflict', 'El propietario no se puede modificar aquí.');
    }
    if (changes.status !== 'active' || target.status !== 'disabled') return undefined;
    if ((await createTeamRepository(trx, ctx.tenantId).countActiveSellers()) >= SELLER_LIMIT) {
      throw LIMIT_REACHED();
    }
    return target;
  });
  if (reactivating) await directory.enable(reactivating.identitySubject);

  const { member, disabled } = await db.transaction().execute(async (trx) => {
    const team = createTeamRepository(trx, ctx.tenantId);
    await team.lockTenant();
    const target = await team.find(parsedId.data, { forUpdate: true });
    if (!target) throw MEMBER_NOT_FOUND();

    const audit: Record<string, unknown> = { email: target.email };
    if (changes.displayName !== undefined && changes.displayName !== target.displayName) {
      await team.setDisplayName(target.userId, changes.displayName);
      await recordAudit(trx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        entity: 'team_member',
        entityId: target.userId,
        action: 'rename',
        data: { ...audit, before: target.displayName, after: changes.displayName },
      });
    }
    let disabledNow: MemberRow | undefined;
    if (changes.status !== undefined && changes.status !== target.status) {
      if (changes.status === 'active' && (await team.countActiveSellers()) >= SELLER_LIMIT) {
        throw LIMIT_REACHED();
      }
      await team.setStatus(target.userId, changes.status);
      await recordAudit(trx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        entity: 'team_member',
        entityId: target.userId,
        action: changes.status === 'disabled' ? 'disable' : 'enable',
        data: audit,
      });
      if (changes.status === 'disabled') disabledNow = target;
    } else if (changes.status === 'disabled') {
      // Reintento de una baja que quedó a medias: se repite lo del proveedor.
      disabledNow = target;
    }
    return { member: (await team.find(target.userId))!, disabled: disabledNow };
  });

  if (disabled) {
    await directory.disable(disabled.identitySubject);
    await directory.signOutEverywhere(disabled.identitySubject);
  }
  return toMember(member);
}
