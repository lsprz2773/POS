import { formatMoney, type PendingSale } from '@pos/shared';
import { CalendarDays, PartyPopper, SearchX } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageHeader } from '../../components/PageHeader';
import { LoadingRegion, MetricSkeleton, Skeleton } from '../../components/Skeleton';
import { StatusBadge } from '../../components/StatusBadge';
import { Stat } from '../../components/Stat';
import { copy } from '../../copy/es';
import { formatShortDate } from '../../lib/format';
import { useCurrency, useToday } from '../store/useStore';
import { DateRangeSheet } from './DateRangeSheet';
import { usePending, type PendingFilter } from './useSales';

const shortDate = formatShortDate;

function PendingCard({
  sale,
  today,
  money,
}: {
  sale: PendingSale;
  today: string | undefined;
  money: (amount: string) => string;
}) {
  const previous = today !== undefined && sale.date < today;
  return (
    <li className="glass2 card flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Link
          to={`/ventas/${sale.id}`}
          className="h2 flex-1 text-inherit no-underline"
          style={{ fontSize: 16 }}
        >
          {sale.folio}
        </Link>
        {previous ? <span className="bdg bdg-mut">{copy.sale.previousDay}</span> : null}
        <StatusBadge status={sale.paymentStatus} />
      </div>
      <div className="cap">
        {shortDate(sale.date)}
        {sale.customerReference ? ` · ${sale.customerReference}` : ''}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label={copy.sale.totalShort} value={money(sale.total)} />
        <Stat label={copy.sale.receivedShort} value={money(sale.paid)} />
        <Stat label={copy.sale.missingShort} value={money(sale.balance)} />
      </div>
      <Link
        to={`/ventas/${sale.id}`}
        className="btn btn-p"
        aria-label={`${copy.sale.registerPayment} ${sale.folio}`}
      >
        {copy.sale.registerPayment}
      </Link>
    </li>
  );
}

/** Ventas con saldo de cualquier día, con el total que falta por cobrar (RF-073 a RF-080). */
export function PendingPage() {
  const today = useToday();
  const currency = useCurrency();
  const money = (amount: string) => formatMoney(amount, currency);
  const [filter, setFilter] = useState<PendingFilter>({});
  const [filtering, setFiltering] = useState(false);
  const query = usePending(filter);
  const sales = query.data?.pages.flatMap((page) => page.items) ?? [];
  const first = query.data?.pages[0];
  const filtered = filter.from !== undefined || filter.to !== undefined;

  const label = filtered
    ? copy.sale.rangeLabel(
        filter.from ? shortDate(filter.from) : '…',
        filter.to ? shortDate(filter.to) : '…',
      )
    : copy.sale.allDates;

  return (
    <>
      <PageHeader title={copy.sale.pendingTitle} />
      {/* El rango va en su propia fila: con fechas elegidas es largo y no cabe junto al título en 360 px. */}
      <div className="flex">
        <button type="button" className="pill" onClick={() => setFiltering(true)}>
          <CalendarDays className="ic" aria-hidden="true" />
          {label}
        </button>
      </div>

      {query.isPending ? (
        <LoadingRegion label={copy.states.loading}>
          <div className="flex flex-col gap-3">
            <MetricSkeleton />
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-44 w-full" />
          </div>
        </LoadingRegion>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <section
            className="glass card flex items-center justify-between gap-3"
            aria-label={copy.sale.pendingBalance}
          >
            <div>
              <div className="sub">{copy.sale.pendingBalance}</div>
              <div className="font-extrabold" style={{ fontSize: 32, letterSpacing: '-0.03em' }}>
                {money(first?.totalBalance ?? '0.00')}
              </div>
            </div>
            <span className="bdg bdg-pen">{copy.sale.pendingCount(first?.total ?? 0)}</span>
          </section>

          {sales.length === 0 ? (
            filtered ? (
              <EmptyState
                icon={SearchX}
                title={copy.sale.pendingNoResultsTitle}
                text={copy.sale.pendingNoResultsText}
                action={<Button onClick={() => setFilter({})}>{copy.sale.clear}</Button>}
              />
            ) : (
              <EmptyState
                icon={PartyPopper}
                title={copy.sale.pendingEmptyTitle}
                text={copy.sale.pendingEmptyText}
              />
            )
          ) : (
            <>
              <ul className="stagger m-0 flex list-none flex-col gap-3 p-0">
                {sales.map((sale) => (
                  <PendingCard key={sale.id} sale={sale} today={today} money={money} />
                ))}
              </ul>
              {query.hasNextPage ? (
                <Button
                  block
                  loading={query.isFetchingNextPage}
                  onClick={() => void query.fetchNextPage()}
                >
                  {copy.day.loadMore}
                </Button>
              ) : null}
            </>
          )}
        </>
      )}

      {filtering && today ? (
        <DateRangeSheet
          today={today}
          value={filter}
          onClose={() => setFiltering(false)}
          onApply={(range) => {
            setFilter(range);
            setFiltering(false);
          }}
        />
      ) : null}
    </>
  );
}
