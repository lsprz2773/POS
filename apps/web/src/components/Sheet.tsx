import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: string;
  /** Falso para diálogos bloqueantes (sesión expirada) o mientras se procesa. */
  dismissible?: boolean;
  closeLabel?: string;
  children: ReactNode;
}

/**
 * Hoja inferior en móvil y modal centrado en escritorio. Radix aporta el foco atrapado, devuelto al
 * disparador, Esc, bloqueo del fondo y los roles accesibles; aquí solo se fija el estilo y las reglas.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  dismissible = true,
  closeLabel = 'Cerrar',
  children,
}: Props) {
  const block = (event: Event) => {
    if (!dismissible) event.preventDefault();
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="scrim" />
        <Dialog.Content
          className="sheet glass2"
          onEscapeKeyDown={block}
          onPointerDownOutside={block}
          onInteractOutside={block}
        >
          <div className="grab" aria-hidden="true" />
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="h2">{title}</Dialog.Title>
            {dismissible ? (
              <Dialog.Close className="iconbtn" aria-label={closeLabel}>
                <X className="ic" aria-hidden="true" />
              </Dialog.Close>
            ) : null}
          </div>
          {description ? (
            <Dialog.Description className="sub">{description}</Dialog.Description>
          ) : (
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
