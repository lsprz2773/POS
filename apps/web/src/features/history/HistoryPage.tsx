import { formatMoney, type SaleSummary } from '@pos/shared';
import { CalendarDays, ReceiptText, SearchX } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageHeader } from '../../components/PageHeader';
import { SearchField } from '../../components/SearchField';
import { Segmented } from '../../components/Segmented';
import { LoadingRegion, RowSkeleton } from '../../components/Skeleton';
import { StatusBadge } from '../../components/StatusBadge';
import { copy } from '../../copy/es';
import { formatShortDate, formatTime } from '../../lib/format';
import { useDebounced } from '../../lib/useDebounced';
import { DateRangeSheet } from '../sales/DateRangeSheet';
import { useStore, useToday } from '../store/useStore';
import { useSalesList, type HistoryFilter } from './useSalesList';

const FILTERS = [
  { value: 'all', label: copy.history.all },
  { value: 'paid', label: copy.history.paid },
  { value: 'pending', label: copy.history.pending },
  { value: 'cancelled', label: copy.history.cancelled },
] as const;

function SaleRow({
  sale,
  money,
  timezone,
}: {
  sale: SaleSummary;
  money: (amount: string) => string;
  timezone: string;
}) {
  return (
    <li>
      <Link to={`/ventas/${sale.id}`} className="li">
        <div className="min-w-0 flex-1">
          <div>
            <b>{sale.folio}</b>{' '}
            <span className="cap">
              · {formatShortDate(sale.date)}, {formatTime(sale.createdAt, timezone)}
            </span>
          </div>
          <div className="cap break-words">
            {sale.customerReference ?? copy.history.noReference}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <b>{money(sale.total)}</b>
          <StatusBadge status={sale.paymentStatus} />
        </div>
      </Link>
    </li>
  );
}

/** Historial de ventas con búsqueda por folio o cliente, filtros y "Cargar más" (RF-081, RNF-006). */
export function HistoryPage() {
  const store = useStore();
  const today = useToday();
  const currency = store.data?.currency ?? 'MXN';
  const timezone = store.data?.timezone ?? 'America/Mexico_City';
  const money = (amount: string) => formatMoney(amount, currency);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [range, setRange] = useState<{ from?: string; to?: string }>({});
  const [choosingRange, setChoosingRange] = useState(false);
  const q = useDebounced(search.trim());
  const query = useSalesList({ q, filter, ...range });
  const sales = query.data?.pages.flatMap((page) => page.items) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;
  const filtering =
    q !== '' || filter !== 'all' || range.from !== undefined || range.to !== undefined;
  const rangeLabel =
    range.from || range.to
      ? `${range.from ? formatShortDate(range.from) : '…'} a ${range.to ? formatShortDate(range.to) : '…'}`
      : copy.sale.allDates;

  return (
    <>
      <PageHeader title={copy.history.title} back={{ to: '/mas', label: copy.history.back }} />
      {/* El rango va en su propia fila: con fechas elegidas es largo y no cabe junto al título en 360 px. */}
      <div className="flex">
        <button type="button" className="pill" onClick={() => setChoosingRange(true)}>
          <CalendarDays className="ic" aria-hidden="true" />
          {rangeLabel}
        </button>
      </div>
      <SearchField
        label={copy.history.search}
        placeholder={copy.history.placeholder}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <Segmented<HistoryFilter>
        label={copy.history.filter}
        value={filter}
        options={FILTERS}
        onChange={setFilter}
      />

      {query.isPending ? (
        <LoadingRegion label={copy.states.loading}>
          <div className="glass2 overflow-hidden p-0">
            {[0, 1, 2, 3, 4].map((n) => (
              <RowSkeleton key={n} />
            ))}
          </div>
        </LoadingRegion>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : sales.length === 0 ? (
        filtering ? (
          <EmptyState
            icon={SearchX}
            title={copy.history.noResultsTitle}
            text={copy.history.noResultsText}
          />
        ) : (
          <EmptyState
            icon={ReceiptText}
            title={copy.history.emptyTitle}
            text={copy.history.emptyText}
            action={
              <Link to="/vender" className="btn btn-p">
                {copy.history.emptyAction}
              </Link>
            }
          />
        )
      ) : (
        <>
          <p className="cap m-0" role="status">
            {copy.history.results(total)}
          </p>
          <ul className="glass2 m-0 list-none overflow-hidden p-0">
            {sales.map((sale) => (
              <SaleRow key={sale.id} sale={sale} money={money} timezone={timezone} />
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

      {choosingRange && today ? (
        <DateRangeSheet
          today={today}
          value={range}
          onClose={() => setChoosingRange(false)}
          onApply={(next) => {
            setRange(next);
            setChoosingRange(false);
          }}
        />
      ) : null}
    </>
  );
}
