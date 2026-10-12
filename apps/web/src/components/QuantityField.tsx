import { Minus, Plus } from 'lucide-react';
import { useId } from 'react';
import { AlertCircle } from 'lucide-react';
import { fromMilli, toMilli } from '@pos/shared';

/**
 * Cantidad con botones − y +. Escribir también funciona; el teclado es numérico. Los pasos usan
 * aritmética exacta en milésimas, nunca punto flotante.
 */
export function QuantityField({
  label,
  value,
  onChange,
  error,
  hint,
  fractions = false,
  min = '0',
  id: given,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  fractions?: boolean;
  min?: string;
  id?: string;
}) {
  const generated = useId();
  const id = given ?? generated;
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ');

  function step(direction: 1 | -1) {
    const current = /^\d+(\.\d{1,3})?$/.test(value) ? toMilli(value) : toMilli(min);
    const next = current + BigInt(direction) * 1000n;
    onChange(fromMilli(next < toMilli(min) ? toMilli(min) : next));
  }

  return (
    <div>
      <label className="lbl" htmlFor={id}>
        {label}
      </label>
      <div className="qty">
        <button
          type="button"
          aria-label={`Disminuir ${label.toLowerCase()}`}
          onClick={() => step(-1)}
        >
          <Minus className="ic" aria-hidden="true" />
        </button>
        <input
          id={id}
          className="qv"
          inputMode={fractions ? 'decimal' : 'numeric'}
          autoComplete="off"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          aria-label={`Aumentar ${label.toLowerCase()}`}
          onClick={() => step(1)}
        >
          <Plus className="ic" aria-hidden="true" />
        </button>
      </div>
      {error ? (
        <p id={`${id}-error`} className="errt">
          <AlertCircle className="ic" aria-hidden="true" />
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={`${id}-hint`} className="hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
