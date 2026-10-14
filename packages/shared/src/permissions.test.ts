import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLES, can, isOwnRowsOnly } from './permissions';

describe('permisos por rol', () => {
  it('el propietario puede todo', () => {
    for (const permission of PERMISSIONS) expect(can('owner', permission)).toBe(true);
  });

  it('el vendedor vende, cobra, cancela lo suyo y prepara su día', () => {
    for (const permission of [
      'sale:create',
      'sale:read',
      'sale:cancel',
      'payment:register',
      'payment:void',
      'workday:read',
      'workday:prepare',
      'report:read',
      'product:read',
      'store:read',
    ] as const) {
      expect(can('seller', permission)).toBe(true);
    }
  });

  it('el vendedor no crea productos, no cambia la tienda ni el horario y no gestiona equipo', () => {
    for (const permission of [
      'product:write',
      'store:update',
      'workday:hours',
      'team:manage',
      'team:report',
    ] as const) {
      expect(can('seller', permission)).toBe(false);
    }
  });

  it('solo el vendedor está limitado a sus propias filas', () => {
    expect(ROLES.map((role) => [role, isOwnRowsOnly(role)])).toEqual([
      ['owner', false],
      ['seller', true],
    ]);
  });
});
