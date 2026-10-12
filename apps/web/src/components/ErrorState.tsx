import { CloudOff, TriangleAlert } from 'lucide-react';
import { ApiError } from '../lib/api';
import { messageOf, requestIdOf } from '../lib/errors';
import { copy } from '../copy/es';
import { Button } from './Button';

/**
 * Error de carga de pantalla: dice qué pasó, ofrece "Reintentar" y, si el servidor falló, muestra
 * el código de referencia para soporte. Nunca deja cifras parciales como si fueran definitivas.
 */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const offline =
    error instanceof ApiError && (error.code === 'network' || error.code === 'unavailable');
  const Icon = offline ? CloudOff : TriangleAlert;
  const reference = requestIdOf(error);
  return (
    <div
      role="alert"
      className="glass card flex flex-col items-center gap-3 px-6 py-10 text-center"
    >
      <Icon className="h-12 w-12" style={{ color: 'var(--bad)' }} aria-hidden="true" />
      <h2 className="h2">{copy.states.loadErrorTitle}</h2>
      <p className="sub max-w-sm">{messageOf(error)}</p>
      {reference ? (
        <p className="cap">
          {copy.states.reference}: <code>{reference}</code>
        </p>
      ) : null}
      {onRetry ? (
        <Button variant="primary" onClick={onRetry}>
          {copy.states.retry}
        </Button>
      ) : null}
    </div>
  );
}
