import type { MemberStatus, Role } from '@pos/shared';
import type { Database } from '../../db/client';

export interface MemberRow {
  userId: string;
  email: string;
  displayName: string | null;
  identitySubject: string;
  role: Role;
  status: MemberStatus;
  createdAt: Date;
}

/** Repositorio acotado a una tienda: solo ve a las personas de su propio equipo. */
export function createTeamRepository(db: Database, tenantId: string) {
  const members = () =>
    db
      .selectFrom('memberships as m')
      .innerJoin('users as u', 'u.id', 'm.user_id')
      .select([
        'u.id as userId',
        'u.email',
        'u.display_name as displayName',
        'u.identity_subject as identitySubject',
        'm.role',
        'm.status',
        'm.created_at as createdAt',
      ])
      .where('m.tenant_id', '=', tenantId);

  return {
    /** El propietario primero y luego los vendedores por nombre. */
    async list(): Promise<MemberRow[]> {
      const rows = await members()
        .orderBy('m.role', 'asc')
        .orderBy((eb) => eb.fn('lower', [eb.fn.coalesce('u.display_name', 'u.email')]))
        .orderBy('u.id')
        .execute();
      return rows as MemberRow[];
    },

    async find(
      userId: string,
      options: { forUpdate?: boolean } = {},
    ): Promise<MemberRow | undefined> {
      let query = members().where('m.user_id', '=', userId);
      if (options.forUpdate) query = query.forUpdate('m');
      return (await query.executeTakeFirst()) as MemberRow | undefined;
    },

    /** Bloquea la tienda mientras dure la transacción: el tope de vendedores se revisa de uno en uno. */
    async lockTenant(): Promise<void> {
      await db
        .selectFrom('tenants')
        .select('id')
        .where('id', '=', tenantId)
        .forUpdate()
        .executeTakeFirstOrThrow();
    },

    async countActiveSellers(): Promise<number> {
      const row = await db
        .selectFrom('memberships')
        .select((eb) => eb.fn.countAll<string>().as('total'))
        .where('tenant_id', '=', tenantId)
        .where('role', '=', 'seller')
        .where('status', '=', 'active')
        .executeTakeFirstOrThrow();
      return Number(row.total);
    },

    async emailTaken(email: string): Promise<boolean> {
      const row = await db
        .selectFrom('users')
        .select('id')
        .where((eb) => eb(eb.fn('lower', ['email']), '=', email.toLowerCase()))
        .executeTakeFirst();
      return row !== undefined;
    },

    async insertSeller(values: {
      email: string;
      displayName: string;
      identitySubject: string;
      invitedBy: string;
    }): Promise<string> {
      const user = await db
        .insertInto('users')
        .values({
          email: values.email,
          display_name: values.displayName,
          identity_subject: values.identitySubject,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await db
        .insertInto('memberships')
        .values({
          tenant_id: tenantId,
          user_id: user.id,
          role: 'seller',
          status: 'active',
          invited_by: values.invitedBy,
        })
        .execute();
      return user.id;
    },

    async setDisplayName(userId: string, displayName: string): Promise<void> {
      await db
        .updateTable('users')
        .set({ display_name: displayName })
        .where('id', '=', userId)
        .execute();
    },

    async setStatus(userId: string, status: MemberStatus): Promise<void> {
      await db
        .updateTable('memberships')
        .set({ status })
        .where('tenant_id', '=', tenantId)
        .where('user_id', '=', userId)
        .execute();
    },
  };
}
