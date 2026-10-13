import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { copy } from '../copy/es';

/**
 * Al expirar la sesión se sale a iniciar sesión sin preguntar: ya no se puede guardar nada y el
 * borrador de la venta queda en el navegador (lib/draft.ts). La pantalla de inicio de sesión lo apaga.
 */
let sessionEnded = false;
export const setSessionEnded = (value: boolean) => {
  sessionEnded = value;
};

/**
 * Evita perder cambios sin guardar (M6): intercepta la navegación dentro de la app y el cierre de la
 * pestaña. Tras guardar, `allowLeave()` deja salir sin preguntar.
 */
export function useUnsavedGuard(dirty: boolean) {
  const allowed = useRef(false);
  const blocker = useBlocker(() => dirty && !allowed.current && !sessionEnded);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!allowed.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const dialog = (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      title={copy.unsaved.title}
      description={copy.unsaved.text}
      safeLabel={copy.unsaved.keep}
      onSafe={() => blocker.reset?.()}
      riskLabel={copy.unsaved.discard}
      onRisk={() => blocker.proceed?.()}
    />
  );

  return {
    allowLeave: () => {
      allowed.current = true;
    },
    dialog,
  };
}
