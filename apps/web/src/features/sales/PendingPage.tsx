import { formatMoney, type OwedBySeller, type PendingSale } from '@pos/shared';
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
import { useSellerOptions } from '../team/useSellerOptions';
import { DateRangeSheet } from './DateRangeSheet';
import { usePending, type PendingFilter } from './useSales';

const shortDate = formatShortDate;

function PendingCard({
  sale,
  today,
  money,
  showSeller,
}: {
  sale: PendingSale;
  today: string | undefined;
  money: (amount: string) => string;
  showSeller: boolean;
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
        {showSeller ? ` · ${sale.createdBy.name}` : ''}
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

/** Lo que se le debe a cada persona (T112). Tocar una fila filtra la lista por esa persona. */
function BySeller({
  rows,
  money,
  onPick,
}: {
  rows: OwedBySeller[];
  money: (amount: string) => string;
  onPick: (sellerId: string) => void;
}) {
  return (
    <section className="glass2 card flex flex-col gap-3" aria-label={copy.sale.bySellerTitle}>
      <div>
        <h2 className="h2" style={{ fontSize: 16 }}>
          {copy.sale.bySellerTitle}
        </h2>
        <p className="cap m-0">{copy.sale.bySellerNote}</p>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {rows.map((row) => (
          <li key={row.userId}>
            <button
              type="button"
              className="btn btn-g btn-block"
              style={{ justifyContent: 'space-between' }}
              aria-label={copy.sale.bySellerRow(row.name)}
              onClick={() => onPick(row.userId)}
            >
              <span className="min-w-0 break-words text-left">
                {row.name} <span className="cap">· {copy.sale.pendingCount(row.count)}</span>
              </span>
              <b>{money(row.total)}</b>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Ventas con saldo de cualquier día, con el total que falta por cobrar (RF-073 a RF-080). */
export function PendingPage() {
  const today = useToday();
  const currency = useCurrency();
  const money = (amount: string) => formatMoney(amount, currency);
  const [filter, setFilter] = useState<PendingFilter>({});
  const [filtering, setFiltering] = useState(false);
  const { options: sellers, showSeller } = useSellerOptions();
  const query = usePending(filter);
  const sales = query.data?.pages.flatMap((page) => page.items) ?? [];
  const first = query.data?.pages[0];
  const dated = filter.from !== undefined || filter.to !== undefined;
  const filtered = dated || filter.sellerId !== undefined;
  const sellerName = sellers.find((seller) => seller.id === filter.sellerId)?.name;

  const dateLabel = dated
    ? copy.sale.rangeLabel(
        filter.from ? shortDate(filter.from) : '…',
        filter.to ? shortDate(filter.to) : '…',
      )
    : copy.sale.allDates;
  const label = sellerName ? `${sellerName} · ${dateLabel}` : dateLabel;

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

          {showSeller && first?.bySeller && first.bySeller.length > 0 ? (
            <BySeller
              rows={first.bySeller}
              money={money}
              onPick={(sellerId) => setFilter({ ...filter, sellerId })}
            />
          ) : null}

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
                  <PendingCard
                    key={sale.id}
                    sale={sale}
                    today={today}
                    money={money}
                    showSeller={showSeller}
                  />
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
          sellers={sellers}
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
