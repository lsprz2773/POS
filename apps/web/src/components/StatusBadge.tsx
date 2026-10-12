import type { CollectionStatus } from '@pos/shared';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { copy } from '../copy/es';

const VIEW = {
  paid: { cls: 'bdg-ok', Icon: CheckCircle2, text: copy.status.paid },
  pending: { cls: 'bdg-pen', Icon: Clock, text: copy.status.pending },
  partial: { cls: 'bdg-pen', Icon: Clock, text: copy.status.partial },
  cancelled: { cls: 'bdg-can', Icon: XCircle, text: copy.status.cancelled },
} as const;

/** Estado de cobro con texto e ícono: nunca depende solo del color. */
export function StatusBadge({ status }: { status: CollectionStatus }) {
  const { cls, Icon, text } = VIEW[status];
  return (
    <span className={`bdg ${cls}`}>
      <Icon className="ic" aria-hidden="true" />
      {text}
    </span>
  );
}
