import { AlertCircle } from 'lucide-react';
import { useId, type ComponentProps, type ReactNode } from 'react';

interface Common {
  label: string;
  error?: string;
  hint?: string;
  className?: string;
}

function Shell({
  id,
  label,
  error,
  hint,
  className = '',
  children,
}: Common & { id: string; children: (describedBy: string | undefined) => ReactNode }) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error && errorId, hint && hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={className}>
      <label className="lbl" htmlFor={id}>
        {label}
      </label>
      {children(describedBy)}
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

type InputProps = Common & ComponentProps<'input'>;

/** Campo con etiqueta visible; el error y la ayuda quedan asociados al control (WCAG 2.2). */
export function Field({ label, error, hint, className, id: given, ...input }: InputProps) {
  const generated = useId();
  const id = given ?? generated;
  return (
    <Shell id={id} label={label} error={error} hint={hint} className={className}>
      {(describedBy) => (
        <input
          id={id}
          className="inp"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...input}
        />
      )}
    </Shell>
  );
}

type TextAreaProps = Common & ComponentProps<'textarea'>;

export function TextAreaField({
  label,
  error,
  hint,
  className,
  id: given,
  ...area
}: TextAreaProps) {
  const generated = useId();
  const id = given ?? generated;
  return (
    <Shell id={id} label={label} error={error} hint={hint} className={className}>
      {(describedBy) => (
        <textarea
          id={id}
          className="inp"
          style={{ padding: '12px 14px', minHeight: 84, resize: 'none' }}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...area}
        />
      )}
    </Shell>
  );
}

type SelectProps = Common & ComponentProps<'select'>;

export function SelectField({
  label,
  error,
  hint,
  className,
  children,
  id: given,
  ...select
}: SelectProps) {
  const generated = useId();
  const id = given ?? generated;
  return (
    <Shell id={id} label={label} error={error} hint={hint} className={className}>
      {(describedBy) => (
        <select
          id={id}
          className="inp"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...select}
        >
          {children}
        </select>
      )}
    </Shell>
  );
}
