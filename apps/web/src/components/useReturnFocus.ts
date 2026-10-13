import { useRef } from 'react';

/**
 * Devuelve el foco a quien abrió el diálogo. Radix solo lo hace con un `Trigger`; aquí los diálogos se
 * abren por estado, así que se recuerda el elemento enfocado al abrir y se restaura al cerrar (WCAG 2.4.3).
 */
export function useReturnFocus() {
  const opener = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: () => {
      opener.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    },
    onCloseAutoFocus: (event: Event) => {
      event.preventDefault();
      const target = opener.current;
      opener.current = null;
      if (target?.isConnected) target.focus();
    },
  };
}
