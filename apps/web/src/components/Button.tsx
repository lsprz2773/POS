import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import { copy } from '../copy/es';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANT: Record<Variant, string> = {
  primary: 'btn-p',
  secondary: 'btn-s',
  danger: 'btn-d',
  ghost: 'btn-g',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  large?: boolean;
  block?: boolean;
  /** Mientras procesa se deshabilita y muestra "Procesando…" para evitar el doble envío. */
  loading?: boolean;
}

export function Button({
  variant = 'secondary',
  large,
  block,
  loading,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: Props) {
  const classes = ['btn', VARIANT[variant], large && 'btn-lg', block && 'btn-block', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <>
          <Loader2 className="ic spin" aria-hidden="true" />
          {copy.states.processing}
        </>
      ) : (
        children
      )}
    </button>
  );
}
