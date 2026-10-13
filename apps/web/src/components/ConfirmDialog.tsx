import * as AlertDialog from '@radix-ui/react-alert-dialog';
import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  description: ReactNode;
  /** Acción segura y principal: recibe el foco al abrir. */
  safeLabel: string;
  onSafe: () => void;
  /** Acción que descarta o destruye: va aparte, con texto concreto. */
  riskLabel: string;
  onRisk: () => void;
  risking?: boolean;
  /** Contenido extra entre la descripción y los botones (por ejemplo, un campo de motivo). */
  children?: ReactNode;
  /** Mientras falten datos obligatorios la acción de riesgo no se habilita. */
  riskDisabled?: boolean;
}

/**
 * Confirmación de alto impacto (`alertdialog`). El foco inicial queda en la salida segura, nunca en la
 * acción destructiva, y Esc equivale a la salida segura.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  safeLabel,
  onSafe,
  riskLabel,
  onRisk,
  risking,
  children,
  riskDisabled,
}: Props) {
  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => (!next ? onSafe() : undefined)}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="scrim" />
        <AlertDialog.Content className="sheet glass2">
          <div className="grab" aria-hidden="true" />
          <AlertDialog.Title className="h2">{title}</AlertDialog.Title>
          <AlertDialog.Description className="sub">{description}</AlertDialog.Description>
          {children}
          <div className="flex flex-col gap-2">
            <AlertDialog.Cancel asChild>
              <button type="button" className="btn btn-p btn-lg btn-block" onClick={onSafe}>
                {safeLabel}
              </button>
            </AlertDialog.Cancel>
            <button
              type="button"
              className="btn btn-s btn-block"
              style={{ color: 'var(--bad)', borderColor: 'var(--bad)' }}
              disabled={risking || riskDisabled}
              onClick={onRisk}
            >
              {riskLabel}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

/** Aviso que solo se reconoce ("Entendido"): explica por qué una acción no es posible. */
export function NoticeDialog({
  open,
  title,
  description,
  actionLabel,
  onClose,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  actionLabel: string;
  onClose: () => void;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="scrim" />
        <AlertDialog.Content className="sheet glass2">
          <div className="grab" aria-hidden="true" />
          <AlertDialog.Title className="h2">{title}</AlertDialog.Title>
          <AlertDialog.Description className="sub">{description}</AlertDialog.Description>
          <AlertDialog.Cancel asChild>
            <button type="button" className="btn btn-p btn-lg btn-block" onClick={onClose}>
              {actionLabel}
            </button>
          </AlertDialog.Cancel>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
