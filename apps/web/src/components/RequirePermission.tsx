import type { Permission } from '@pos/shared';
import { useEffect, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import { copy } from '../copy/es';
import { useCan } from '../features/session/usePermission';
import { useToast } from './Toast';

/**
 * Guarda de pantalla por permiso: quien no lo tiene vuelve a Hoy con un aviso (por ejemplo, un vendedor
 * que pega la dirección de Catálogo). El servidor rechaza igual cualquier llamada sin permiso.
 */
export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const allowed = useCan(permission);
  const toast = useToast();
  useEffect(() => {
    if (!allowed) toast.show('warn', copy.roles.denied);
  }, [allowed, toast]);
  return allowed ? children : <Navigate to="/" replace />;
}
