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
}: Props) {
  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => (!next ? onSafe() : undefined)}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="scrim" />
        <AlertDialog.Content className="sheet glass2">
          <div className="grab" aria-hidden="true" />
          <AlertDialog.Title className="h2">{title}</AlertDialog.Title>
          <AlertDialog.Description className="sub">{description}</AlertDialog.Description>
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
              disabled={risking}
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
