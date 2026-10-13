import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';

export type Tone = 'info' | 'warn' | 'bad' | 'ok';

const ICON = { info: Info, warn: AlertTriangle, bad: XCircle, ok: CheckCircle2 } as const;

/** Aviso en línea. Los errores se anuncian de inmediato; el resto, sin interrumpir. */
export function Banner({
  tone = 'info',
  children,
  className = '',
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  const Icon = ICON[tone];
  return (
    <div className={`ban ban-${tone} ${className}`} role={tone === 'bad' ? 'alert' : 'status'}>
      <Icon className="ic" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
