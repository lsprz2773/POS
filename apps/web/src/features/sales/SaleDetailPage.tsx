import { formatMoney, type Payment } from '@pos/shared';
import { useRef, useState } from 'react';
import { useParams } from 'react-router';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { useOnline } from '../../components/OfflineBanner';
import { PageHeader } from '../../components/PageHeader';
import { LoadingRegion, Skeleton } from '../../components/Skeleton';
import { StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';
import { copy } from '../../copy/es';
import { ApiError } from '../../lib/api';
import { createIntentKeys } from '../../lib/idempotency';
import { formatDateTime } from '../../lib/format';
import { useStore, useToday } from '../store/useStore';
import { CancelSaleDialog } from './CancelSaleDialog';
import { PaymentSheet } from './PaymentSheet';
import { useRegisterPayment, useSale } from './useSales';
import { VoidPaymentDialog } from './VoidPaymentDialog';
import { SearchX } from 'lucide-react';

const methodName = (method: Payment['method']) =>
  method === 'cash' ? copy.sale.cash : copy.sale.transfer;

/** Detalle de una venta: renglones congelados, totales, pagos y las acciones que admite (RF-060, RF-072). */
export function SaleDetailPage() {
  const { id } = useParams();
  const query = useSale(id);
  const store = useStore();
  const today = useToday();
  const online = useOnline();
  const toast = useToast();
  const registerPayment = useRegisterPayment(id ?? '');
  const keys = useRef(createIntentKeys());
  const [paying, setPaying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [voiding, setVoiding] = useState<Payment | null>(null);

  const currency = store.data?.currency ?? 'MXN';
  const timezone = store.data?.timezone ?? 'America/Mexico_City';
  const money = (amount: string) => formatMoney(amount, currency);

  const back = { to: '/pendientes', label: copy.sale.back };

  if (query.isPending || store.isPending) {
    return (
      <>
        <PageHeader title="Venta" back={back} />
        <LoadingRegion label={copy.states.loading}>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </LoadingRegion>
      </>
    );
  }
  if (query.isError) {
    const gone = query.error instanceof ApiError && query.error.status === 404;
    return (
      <>
        <PageHeader title="Venta" back={back} />
        {gone ? (
          <EmptyState
            icon={SearchX}
            title={copy.sale.saleNotFoundTitle}
            text={query.error.message}
          />
        ) : (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        )}
      </>
    );
  }

  const sale = query.data;
  const cancelled = sale.status === 'cancelled';
  const canPay = !cancelled && sale.balance !== '0.00';

  return (
    <>
      <PageHeader
        title={copy.sale.detailTitle(sale.folio)}
        back={back}
        action={<StatusBadge status={sale.paymentStatus} />}
      />

      {cancelled && sale.cancellation ? (
        <Banner tone="bad">
          <p className="m-0 font-bold">{copy.sale.cancelled}</p>
          <p className="m-0">
            {copy.sale.cancelledOn(formatDateTime(sale.cancellation.cancelledAt, timezone))}.{' '}
            {copy.sale.reason}: {sale.cancellation.reason}
          </p>
          <p className="m-0 mt-1">
            {sale.cancellation.inventoryRestored
              ? copy.sale.inventoryRestored
              : copy.sale.inventoryNotRestored}
          </p>
        </Banner>
      ) : null}
      {sale.outsideWorkdayHours ? <Banner tone="info">{copy.sale.outsideHoursBadge}</Banner> : null}

      <dl className="glass2 card m-0 flex flex-col gap-3">
        <Row label={copy.sale.date} value={formatDateTime(sale.createdAt, timezone)} />
        {sale.customerReference ? (
          <Row label={copy.sale.customerShort} value={sale.customerReference} />
        ) : null}
        {sale.note ? <Row label={copy.sale.noteShort} value={sale.note} /> : null}
      </dl>

      <section className="glass2 card flex flex-col gap-3" aria-label={copy.sale.products}>
        <span className="cap font-bold uppercase" style={{ letterSpacing: '0.06em' }}>
          {copy.sale.products}
        </span>
        {sale.items.map((item) => (
          <div key={item.id} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 break-words">
              <b>{item.quantity} ×</b> {item.productName}{' '}
              <span className="cap">{money(item.unitPrice)}</span>
            </span>
            <b>{money(item.subtotal)}</b>
          </div>
        ))}
        <span className="cap">{copy.sale.frozen}</span>
      </section>

      <section className="glass card flex flex-col gap-2" aria-label={copy.sale.totals}>
        <dl className="m-0 flex flex-col gap-2">
          <Row label={copy.sale.total} value={money(sale.total)} strong />
          <Row label={copy.sale.receivedTotal} value={money(sale.paid)} strong />
        </dl>
        <hr style={{ border: 0, borderTop: '1px solid var(--hair)', width: '100%' }} />
        <div className="flex items-baseline justify-between gap-3">
          <span>{copy.sale.missing}</span>
          <b style={{ fontSize: 30, letterSpacing: '-0.03em' }}>{money(sale.balance)}</b>
        </div>
      </section>

      {cancelled && sale.cancellation ? (
        <Banner tone="info">
          <p className="m-0 font-bold">
            {copy.sale.refundDue}: {money(sale.cancellation.refundDue)}
          </p>
          <p className="m-0">{copy.sale.refundNote}</p>
        </Banner>
      ) : null}

      <section className="glass2 card flex flex-col gap-3" aria-label={copy.sale.payments}>
        <span className="cap font-bold uppercase" style={{ letterSpacing: '0.06em' }}>
          {copy.sale.payments}
        </span>
        {sale.payments.length === 0 ? (
          <p className="sub m-0">{copy.sale.noPayments}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {sale.payments.map((payment) => (
              <li key={payment.id} className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <b>{methodName(payment.method)}</b>{' '}
                  {payment.status === 'voided' ? (
                    <span className="bdg bdg-can">{copy.sale.voided}</span>
                  ) : null}
                  <div className="cap">
                    {formatDateTime(payment.createdAt, timezone)}
                    {payment.status === 'voided' && payment.voidReason
                      ? ` · ${copy.sale.reason}: ${payment.voidReason}`
                      : ''}
                  </div>
                </div>
                <b
                  style={
                    payment.status === 'voided' ? { textDecoration: 'line-through' } : undefined
                  }
                >
                  {money(payment.amount)}
                </b>
                {payment.status === 'valid' && !cancelled ? (
                  <Button
                    disabled={!online}
                    onClick={() => setVoiding(payment)}
                    aria-label={`${copy.sale.void} ${methodName(payment.method)} ${money(payment.amount)}`}
                  >
                    {copy.sale.void}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {!cancelled ? (
        <Button disabled={!online} block onClick={() => setCancelling(true)}>
          {copy.sale.cancelSale}
        </Button>
      ) : null}
      {canPay ? (
        <div className="salebar glass2">
          <Button variant="primary" large block disabled={!online} onClick={() => setPaying(true)}>
            {copy.sale.registerPayment}
          </Button>
        </div>
      ) : null}

      {paying ? (
        <PaymentSheet
          title={copy.sale.paySheetTitle}
          subtitle={copy.sale.detailTitle(sale.folio)}
          currency={currency}
          total={sale.total}
          received={sale.paid}
          balance={sale.balance}
          confirmLabel={copy.sale.payAction}
          online={online}
          onClose={() => setPaying(false)}
          onConfirm={async (lines) => {
            const key = keys.current.keyFor(JSON.stringify({ id: sale.id, lines }));
            await registerPayment.mutateAsync({ key, lines });
            keys.current.done();
            setPaying(false);
            toast.show('ok', copy.sale.paid);
          }}
        />
      ) : null}
      {cancelling ? (
        <CancelSaleDialog
          sale={sale}
          today={today}
          currency={currency}
          timezone={timezone}
          onClose={() => setCancelling(false)}
          onDone={() => {
            setCancelling(false);
            toast.show('ok', copy.sale.cancelDone);
          }}
        />
      ) : null}
      {voiding ? (
        <VoidPaymentDialog
          sale={sale}
          payment={voiding}
          currency={currency}
          timezone={timezone}
          onClose={() => setVoiding(null)}
          onDone={() => {
            setVoiding(null);
            toast.show('ok', copy.sale.voidDone);
          }}
        />
      ) : null}
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="sub">{label}</dt>
      <dd
        className={`m-0 break-words text-right ${strong ? 'font-extrabold' : ''}`}
        style={strong ? { fontSize: 20 } : undefined}
      >
        {value}
      </dd>
    </div>
  );
}
