import { addDays, MAX_DAYS_AHEAD, type DailyOffer } from '@pos/shared';
import { CalendarPlus, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { ConfirmDialog, NoticeDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Field } from '../../components/Field';
import { useOnline } from '../../components/OfflineBanner';
import { PageHeader } from '../../components/PageHeader';
import { LoadingRegion, Skeleton } from '../../components/Skeleton';
import { Stat } from '../../components/Stat';
import { useToast } from '../../components/Toast';
import { copy } from '../../copy/es';
import { ApiError } from '../../lib/api';
import { messageOf } from '../../lib/errors';
import { useToday } from '../store/useStore';
import { AddOfferSheet } from './AddOfferSheet';
import { AdjustSheet } from './AdjustSheet';
import { dayTitle } from './DayHeader';
import { dayQuantity } from './inventory';
import { useRemoveOffer, useWorkday } from './useWorkday';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function OfferCard({
  offer,
  online,
  onIncrease,
  onRemove,
}: {
  offer: DailyOffer;
  online: boolean;
  onIncrease: () => void;
  onRemove: () => void;
}) {
  const hasSales = offer.soldQuantity !== '0';
  return (
    <li className="glass2 card flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="h2 break-words" style={{ fontSize: 16 }}>
            {offer.productName}
          </div>
          <div className="cap">{[offer.productCode, offer.unit].filter(Boolean).join(' · ')}</div>
        </div>
        {offer.productActive ? (
          <span className="bdg bdg-ok">{copy.day.inDay}</span>
        ) : (
          <span className="bdg bdg-pen">{copy.day.inactiveProduct}</span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label={copy.day.initial} value={dayQuantity(offer)} />
        <Stat label={copy.day.sold} value={offer.soldQuantity} />
        <Stat label={copy.day.available} value={offer.availableQuantity} />
      </div>
      <div className="flex items-center gap-3">
        <Button
          disabled={!online}
          onClick={onIncrease}
          aria-label={`${copy.day.increase} ${offer.productName}`}
        >
          {copy.day.increase}
        </Button>
        {hasSales ? (
          <button
            type="button"
            className="cap flex-1 text-left"
            style={{
              background: 'none',
              border: 0,
              font: 'inherit',
              cursor: 'pointer',
              color: 'var(--ink3)',
            }}
            onClick={onRemove}
          >
            {copy.day.withSales}
          </button>
        ) : (
          <Button
            variant="ghost"
            disabled={!online}
            onClick={onRemove}
            aria-label={`${copy.day.remove} ${offer.productName}`}
          >
            {copy.day.remove}
          </Button>
        )}
      </div>
    </li>
  );
}

export function PrepareDayPage() {
  const today = useToday();
  const [params, setParams] = useSearchParams();
  const asked = params.get('fecha');
  const date = asked && DATE.test(asked) ? asked : today;
  const online = useOnline();
  const toast = useToast();
  const query = useWorkday(date);
  const remove = useRemoveOffer(date ?? '');
  const [adding, setAdding] = useState(false);
  const [adjusting, setAdjusting] = useState<DailyOffer | null>(null);
  const [removing, setRemoving] = useState<DailyOffer | null>(null);
  const [blocked, setBlocked] = useState<DailyOffer | null>(null);

  // Un día terminado es de solo consulta: se muestra como inventario.
  if (today && date && date < today) {
    return <Navigate to={`/dia/inventario?fecha=${date}`} replace />;
  }

  const workday = query.data;
  const offers = workday?.offers ?? [];

  function confirmRemove() {
    const offer = removing;
    if (!offer) return;
    remove.mutate(
      { offerId: offer.id },
      {
        onSuccess: () => {
          setRemoving(null);
          toast.show('ok', copy.day.removed);
        },
        onError: (error) => {
          setRemoving(null);
          // Con ventas (aunque estén canceladas) el servidor lo impide: se explica en lugar de fallar.
          if (error instanceof ApiError && error.status === 409) setBlocked(offer);
          else toast.show('bad', messageOf(error));
        },
      },
    );
  }

  return (
    <>
      <PageHeader
        title={copy.day.prepareTitle}
        action={
          <Link to={`/dia/inventario${asked ? `?fecha=${asked}` : ''}`} className="btn btn-s">
            {copy.day.inventory}
          </Link>
        }
      />

      {today && date ? (
        <div className="glass2 card flex flex-col gap-3">
          <Field
            label={copy.day.date}
            type="date"
            value={date}
            min={today}
            max={addDays(today, MAX_DAYS_AHEAD)}
            onChange={(event) => {
              const value = event.target.value;
              if (!DATE.test(value)) return;
              setParams(value === today ? {} : { fecha: value }, { replace: true });
            }}
          />
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="h2" style={{ fontSize: 16 }}>
                {dayTitle(date)}
              </div>
              {workday ? (
                <div className="cap">{copy.day.hours(workday.startTime, workday.endTime)}</div>
              ) : null}
            </div>
            <Link to="/dia/anteriores" className="btn btn-g">
              {copy.day.previous}
            </Link>
          </div>
        </div>
      ) : null}

      {workday && !workday.isOperatingDay ? (
        <Banner tone="warn">{copy.day.notOperating}</Banner>
      ) : null}

      {query.isPending || !date ? (
        <LoadingRegion label={copy.states.loading}>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-36 w-full" />
          </div>
        </LoadingRegion>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : offers.length === 0 ? (
        <EmptyState
          icon={CalendarPlus}
          title={copy.day.notPreparedTitle}
          text={copy.day.notPreparedText}
          action={
            <Button variant="primary" disabled={!online} onClick={() => setAdding(true)}>
              {copy.day.addProduct}
            </Button>
          }
        />
      ) : (
        <>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {offers.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                online={online}
                onIncrease={() => setAdjusting(offer)}
                onRemove={() =>
                  offer.soldQuantity !== '0' ? setBlocked(offer) : setRemoving(offer)
                }
              />
            ))}
          </ul>
          <Button variant="primary" large block disabled={!online} onClick={() => setAdding(true)}>
            <Plus className="ic" aria-hidden="true" />
            {copy.day.addProduct}
          </Button>
        </>
      )}

      {adding && date ? (
        <AddOfferSheet
          date={date}
          takenProductIds={new Set(offers.map((offer) => offer.productId))}
          online={online}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            toast.show('ok', copy.day.added);
          }}
        />
      ) : null}

      {adjusting && date ? (
        <AdjustSheet
          date={date}
          offer={offers.find((offer) => offer.id === adjusting.id) ?? adjusting}
          online={online}
          onClose={() => setAdjusting(null)}
          onDone={() => {
            setAdjusting(null);
            toast.show('ok', copy.day.increased);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        title={copy.day.removeTitle(removing?.productName ?? '')}
        description={copy.day.removeText}
        safeLabel={copy.day.back2}
        onSafe={() => setRemoving(null)}
        riskLabel={copy.day.removeAction}
        onRisk={confirmRemove}
        risking={remove.isPending}
      />
      <NoticeDialog
        open={blocked !== null}
        title={copy.day.cannotRemoveTitle}
        description={copy.day.cannotRemoveText(
          blocked?.productName ?? '',
          blocked?.soldQuantity ?? '0',
        )}
        actionLabel={copy.day.understood}
        onClose={() => setBlocked(null)}
      />
    </>
  );
}
