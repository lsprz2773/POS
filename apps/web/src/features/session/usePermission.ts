import { can, type Permission, type Role } from '@pos/shared';
import { useSession } from './useSession';

/** Rol de la persona con sesión; indefinido mientras carga. */
export function useRole(): Role | undefined {
  const session = useSession();
  return session.status === 'authenticated' ? session.me.role : undefined;
}

/** Identificador de la persona con sesión (para distinguir lo suyo de lo de otros). */
export function useMeId(): string | undefined {
  const session = useSession();
  return session.status === 'authenticated' ? session.me.user.id : undefined;
}

/**
 * Si el rol tiene el permiso (la matriz es la misma que usa el servidor). Es solo comodidad: oculta lo que
 * no se puede usar, pero la autoridad es siempre el servidor (T103).
 */
export function useCan(permission: Permission): boolean {
  const role = useRole();
  return role !== undefined && can(role, permission);
}
