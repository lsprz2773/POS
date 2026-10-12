import { AlertCircle } from 'lucide-react';
import { useId, type ComponentProps } from 'react';

interface Props extends Omit<ComponentProps<'input'>, 'id'> {
  label: string;
  error?: string;
  hint?: string;
}

/** Campo con etiqueta visible; el error y la ayuda quedan asociados al control (WCAG 2.2). */
export function Field({ label, error, hint, className = '', ...input }: Props) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error && errorId, hint && hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={className}>
      <label className="lbl" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="inp"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...input}
      />
      {error ? (
        <p id={errorId} className="errt">
          <AlertCircle className="ic" aria-hidden="true" />
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
