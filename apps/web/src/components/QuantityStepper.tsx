import { fromMilli, toMilli } from '@pos/shared';
import { Minus, Plus } from 'lucide-react';
import { useState } from 'react';

/**
 * Control compacto de cantidad para listas: − [cantidad] +. Se puede teclear; al salir del campo se
 * confirma y se acota a lo permitido (`onCommit` recibe texto decimal exacto).
 */
export function QuantityStepper({
  label,
  value,
  fractions,
  onStep,
  onCommit,
}: {
  label: string;
  value: string;
  fractions: boolean;
  onStep: (direction: 1 | -1) => void;
  onCommit: (value: string) => void;
}) {
  const [typing, setTyping] = useState<string | null>(null);

  function commit() {
    if (typing === null) return;
    const clean = typing.trim();
    const valid = /^\d+(\.\d{1,3})?$/.test(clean);
    let milli = valid ? toMilli(clean) : 0n;
    // Un producto que se vende en piezas no admite fracciones: se redondea hacia abajo.
    if (!fractions) milli -= milli % 1000n;
    setTyping(null);
    onCommit(fromMilli(milli));
  }

  return (
    <div className="qty" role="group" aria-label={label}>
      <button type="button" aria-label={`Quitar una pieza de ${label}`} onClick={() => onStep(-1)}>
        <Minus className="ic" aria-hidden="true" />
      </button>
      <input
        className="qv"
        style={{ width: 56 }}
        inputMode={fractions ? 'decimal' : 'numeric'}
        autoComplete="off"
        aria-label={`Cantidad de ${label}`}
        value={typing ?? value}
        onFocus={(event) => event.target.select()}
        onChange={(event) => setTyping(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
        }}
      />
      <button type="button" aria-label={`Agregar una pieza de ${label}`} onClick={() => onStep(1)}>
        <Plus className="ic" aria-hidden="true" />
      </button>
    </div>
  );
}
