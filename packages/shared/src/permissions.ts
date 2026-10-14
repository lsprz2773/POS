/**
 * Roles y permisos de una tienda (fase 10, T101 a T103). La matriz vive aquí, en un solo lugar, para que
 * la API (que es la autoridad) y la web (que solo oculta lo que no se puede usar) no se contradigan.
 * Debe coincidir con la sección 4.6 de docs/requerimientos.md.
 */
export const ROLES = ['owner', 'seller'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'store:read',
  'store:update',
  'product:read',
  'product:write',
  /** Consultar jornadas e inventario del día. */
  'workday:read',
  /** Preparar el día: agregar, quitar y aumentar productos. */
  'workday:prepare',
  /** Ajustar el horario de una jornada. */
  'workday:hours',
  'sale:create',
  'sale:read',
  'sale:cancel',
  'payment:register',
  'payment:void',
  /** Dashboard y reportes: del vendedor solo ve los suyos. */
  'report:read',
  /** Alta, baja y reactivación de vendedores (fase 10c). */
  'team:manage',
  /** Reportes del equipo y lo que se le debe a cada vendedor (fase 10d). */
  'team:report',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const SELLER_PERMISSIONS: ReadonlySet<Permission> = new Set<Permission>([
  'store:read',
  'product:read',
  'workday:read',
  'workday:prepare',
  'sale:create',
  'sale:read',
  'sale:cancel',
  'payment:register',
  'payment:void',
  'report:read',
]);

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set(PERMISSIONS),
  seller: SELLER_PERMISSIONS,
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

/** El vendedor solo ve y opera lo que él registró; el propietario ve toda la tienda. */
export function isOwnRowsOnly(role: Role): boolean {
  return role === 'seller';
}
