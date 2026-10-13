import { isOutsideHours, localTime, sumQuantities } from '@pos/shared';
import { ClipboardList } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { Banner } from '../../components/Banner';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageHeader } from '../../components/PageHeader';
import { LoadingRegion, Skeleton } from '../../components/Skeleton';
import { copy } from '../../copy/es';
import { useStore, useToday } from '../store/useStore';
import { dayTitle } from './DayHeader';
import { dayQuantity, soldPercent, stockLevel, type StockLevel } from './inventory';
import { useWorkday } from './useWorkday';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const LEVEL: Record<StockLevel, { cls: string; text: string }> = {
  available: { cls: 'bdg-ok', text: copy.day.levelAvailable },
  low: { cls: 'bdg-pen', text: copy.day.levelLow },
  soldout: { cls: 'bdg-can', text: copy.day.levelSoldOut },
};

/** Inventario del día: solo consulta (RF-031). Sirve para hoy y para jornadas anteriores. */
export function InventoryPage() {
  const today = useToday();
  const store = useStore();
  const [params] = useSearchParams();
  const asked = params.get('fecha');
  const date = asked && DATE.test(asked) ? asked : today;
  const query = useWorkday(date);
  const workday = query.data;

  const offers = workday?.offers ?? [];
  const sold = sumQuantities(offers.map((offer) => offer.soldQuantity));
  const available = sumQuantities(offers.map((offer) => offer.availableQuantity));
  const now = new Date();
  const outside =
    workday?.isToday && store.data ? isOutsideHours(store.data.timezone, now, workday) : false;

  return (
    <>
      <PageHeader
        title={copy.day.inventoryTitle}
        back={{ to: '/dia', label: copy.day.back }}
        action={
          workday?.editable ? (
            <Link to={`/dia${asked ? `?fecha=${asked}` : ''}`} className="btn btn-s">
              {copy.day.prepare}
            </Link>
          ) : undefined
        }
      />
      {date ? (
        <p className="sub m-0">
          {dayTitle(date)} · {copy.day.readOnly}
        </p>
      ) : null}

      {outside && store.data && workday ? (
        <Banner tone="warn">
          {copy.day.outsideHours(
            localTime(store.data.timezone, now),
            workday.startTime,
            workday.endTime,
          )}
        </Banner>
      ) : null}

      {query.isPending || !date ? (
        <LoadingRegion label={copy.states.loading}>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </LoadingRegion>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : offers.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={copy.day.emptyInventory}
          text={copy.day.notPreparedText}
          action={
            workday?.editable !== false ? (
              <Link to="/dia" className="btn btn-p">
                {copy.day.prepare}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="glass card">
              <div className="sub">{copy.day.sellable}</div>
              <div className="font-extrabold" style={{ fontSize: 22 }}>
                {sold}
              </div>
            </div>
            <div className="glass card">
              <div className="sub">{copy.day.availableTotal}</div>
              <div className="font-extrabold" style={{ fontSize: 22 }}>
                {available}
              </div>
            </div>
          </div>
          <ul className="glass2 m-0 list-none overflow-hidden p-0">
            {offers.map((offer) => {
              const level = LEVEL[stockLevel(offer)];
              return (
                <li key={offer.id} className="li flex-col items-stretch">
                  <div className="flex items-center gap-3">
                    <span className="h2 min-w-0 flex-1 break-words" style={{ fontSize: 16 }}>
                      {offer.productName}
                    </span>
                    <span className={`bdg ${level.cls}`}>{level.text}</span>
                  </div>
                  <div className="bar" role="img" aria-label={`${soldPercent(offer)} % vendido`}>
                    <i style={{ width: `${soldPercent(offer)}%` }} />
                  </div>
                  <div className="cap flex justify-between gap-2">
                    <span>
                      {copy.day.initial} {dayQuantity(offer)}
                    </span>
                    <span>
                      {copy.day.sold} {offer.soldQuantity}
                    </span>
                    <b>{copy.day.left(offer.availableQuantity)}</b>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
