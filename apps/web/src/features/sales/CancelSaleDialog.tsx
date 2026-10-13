import { formatMoney, type Sale } from '@pos/shared';
import { useState } from 'react';
import { Banner } from '../../components/Banner';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { TextAreaField } from '../../components/Field';
import { copy } from '../../copy/es';
import { messageOf } from '../../lib/errors';
import { formatDateTime } from '../../lib/format';
import { useCancelSale } from './useSales';

/**
 * Cancelar una venta (M2): pide motivo, advierte si es de un día anterior (no restituye el inventario)
 * y recuerda que lo cobrado se devuelve fuera del sistema (B13, B14).
 */
export function CancelSaleDialog({
  sale,
  today,
  currency,
  timezone,
  onClose,
  onDone,
}: {
  sale: Sale;
  today: string | undefined;
  currency: string;
  timezone: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const cancel = useCancelSale(sale.id);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const money = (amount: string) => formatMoney(amount, currency);
  const pastDay = today !== undefined && sale.date < today;
  const hasPayments = sale.paid !== '0.00';

  function submit() {
    if (cancel.isPending) return;
    setFailure(null);
    if (reason.trim() === '') {
      setError(copy.sale.cancelReasonRequired);
      document.getElementById('cancel-reason')?.focus();
      return;
    }
    cancel.mutate(
      { reason: reason.trim() },
      {
        onSuccess: onDone,
        onError: (e) => setFailure(messageOf(e)),
      },
    );
  }

  return (
    <ConfirmDialog
      open
      title={copy.sale.cancelTitle(sale.folio)}
      description={copy.sale.cancelSummary(
        money(sale.total),
        money(sale.paid),
        formatDateTime(sale.createdAt, timezone),
      )}
      safeLabel={copy.sale.keep}
      onSafe={onClose}
      riskLabel={copy.sale.cancelSale}
      onRisk={submit}
      risking={cancel.isPending}
    >
      {failure ? <Banner tone="bad">{failure}</Banner> : null}
      <TextAreaField
        id="cancel-reason"
        label={copy.sale.cancelReason}
        placeholder={copy.sale.cancelReasonPlaceholder}
        value={reason}
        maxLength={200}
        error={error ?? undefined}
        onChange={(event) => {
          setReason(event.target.value);
          setError(null);
        }}
      />
      {pastDay ? <Banner tone="warn">{copy.sale.cancelPastWarning}</Banner> : null}
      {hasPayments ? <Banner tone="info">{copy.sale.cancelRefund(money(sale.paid))}</Banner> : null}
    </ConfirmDialog>
  );
}
