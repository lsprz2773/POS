import { balanceOf, formatMoney, type Payment, type Sale } from '@pos/shared';
import { useState } from 'react';
import { Banner } from '../../components/Banner';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { TextAreaField } from '../../components/Field';
import { copy } from '../../copy/es';
import { messageOf } from '../../lib/errors';
import { formatDateTime } from '../../lib/format';
import { useVoidPayment } from './useSales';

/** Anular un pago (M3, B4): el pago se conserva marcado como anulado y la venta recupera su saldo. */
export function VoidPaymentDialog({
  sale,
  payment,
  currency,
  timezone,
  onClose,
  onDone,
}: {
  sale: Sale;
  payment: Payment;
  currency: string;
  timezone: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const voidPayment = useVoidPayment(sale.id);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const money = (amount: string) => formatMoney(amount, currency);
  const balanceAfter = balanceOf(sale.total, balanceOf(sale.paid, payment.amount));

  function submit() {
    if (voidPayment.isPending) return;
    setFailure(null);
    if (reason.trim() === '') {
      setError(copy.sale.voidReasonRequired);
      document.getElementById('void-reason')?.focus();
      return;
    }
    voidPayment.mutate(
      { paymentId: payment.id, reason: reason.trim() },
      { onSuccess: onDone, onError: (e) => setFailure(messageOf(e)) },
    );
  }

  return (
    <ConfirmDialog
      open
      title={copy.sale.voidTitle}
      description={copy.sale.voidText}
      safeLabel={copy.sale.keep}
      onSafe={onClose}
      riskLabel={copy.sale.voidAction}
      onRisk={submit}
      risking={voidPayment.isPending}
    >
      <div className="glass card flex items-center justify-between gap-3">
        <div>
          <b>{payment.method === 'cash' ? copy.sale.cash : copy.sale.transfer}</b>
          <div className="cap">{formatDateTime(payment.createdAt, timezone)}</div>
        </div>
        <b style={{ fontSize: 20 }}>{money(payment.amount)}</b>
      </div>
      {failure ? <Banner tone="bad">{failure}</Banner> : null}
      <TextAreaField
        id="void-reason"
        label={copy.sale.voidReason}
        value={reason}
        maxLength={200}
        error={error ?? undefined}
        onChange={(event) => {
          setReason(event.target.value);
          setError(null);
        }}
      />
      <Banner tone="warn">
        {copy.sale.voidEffect(sale.folio, money(sale.balance), money(balanceAfter))}
      </Banner>
    </ConfirmDialog>
  );
}
