import { addDays } from '@pos/shared';
import { History } from 'lucide-react';
import { Link } from 'react-router';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageHeader } from '../../components/PageHeader';
import { LoadingRegion, RowSkeleton } from '../../components/Skeleton';
import { copy } from '../../copy/es';
import { useToday } from '../store/useStore';
import { dayTitle } from './DayHeader';
import { usePastWorkdays } from './useWorkday';

/** Jornadas terminadas, de la más reciente a la más antigua; cada una se abre como inventario (RF-036). */
export function PastDaysPage() {
  const today = useToday();
  // `to` es inclusivo: hoy no es una jornada anterior, así que se pide hasta ayer.
  const query = usePastWorkdays(today ? addDays(today, -1) : undefined);
  const days = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <PageHeader title={copy.day.pastTitle} back={{ to: '/dia', label: copy.day.back }} />
      <Banner tone="info">{copy.day.pastInfo}</Banner>

      {query.isPending ? (
        <LoadingRegion label={copy.states.loading}>
          <div className="glass2 overflow-hidden p-0">
            {[0, 1, 2, 3].map((n) => (
              <RowSkeleton key={n} />
            ))}
          </div>
        </LoadingRegion>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : days.length === 0 ? (
        <EmptyState icon={History} title={copy.day.pastEmptyTitle} text={copy.day.pastEmptyText} />
      ) : (
        <>
          <ul className="glass2 m-0 list-none overflow-hidden p-0">
            {days.map((day) => (
              <li key={day.id}>
                <Link to={`/dia/inventario?fecha=${day.date}`} className="li">
                  <span className="min-w-0 flex-1">
                    <span className="h2 block" style={{ fontSize: 16 }}>
                      {dayTitle(day.date)}
                    </span>
                    <span className="cap">
                      {copy.day.products(day.products)} · {copy.day.soldPieces(day.soldQuantity)}
                    </span>
                  </span>
                </Link>
              </li>
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
  );
}
