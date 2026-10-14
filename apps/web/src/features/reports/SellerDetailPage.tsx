import { formatMoney, type SellerDetail } from '@pos/shared';
import { useParams } from 'react-router';
import { Banner } from '../../components/Banner';
import { ErrorState } from '../../components/ErrorState';
import { PageHeader } from '../../components/PageHeader';
import { LoadingRegion, MetricSkeleton } from '../../components/Skeleton';
import { Stat } from '../../components/Stat';
import { copy } from '../../copy/es';
import { formatShortDate } from '../../lib/format';
import { useCurrency } from '../store/useStore';
import { PeriodPicker, usePeriodControl } from './PeriodPicker';
import { ReportBody } from './ReportsPage';
import { useSellerDetail } from './useTeamReport';

type Money = (amount: string) => string;

/** Lo que se le debe a la persona, con la antigüedad del saldo (RF-143, RF-145). */
function Owed({ detail, money }: { detail: SellerDetail; money: Money }) {
  const { owed } = detail.seller;
  const rows = [
    [copy.teamReport.aging7, detail.aging.upTo7],
    [copy.teamReport.aging30, detail.aging.from8To30],
    [copy.teamReport.aging31, detail.aging.over30],
  ] as const;
  return (
    <section className="glass card flex flex-col gap-3" aria-label={copy.teamReport.owedTitle}>
      <h2 className="h2" style={{ fontSize: 16 }}>
        {copy.teamReport.owedTitle}
      </h2>
      <div>
        <div className="font-extrabold" style={{ fontSize: 32, letterSpacing: '-0.03em' }}>
          {money(owed.total)}
        </div>
        <div className="cap">
          {copy.teamReport.owedCount(owed.count)} · {copy.teamReport.owedNote}
        </div>
      </div>
      <div className="flex flex-col gap-2" aria-label={copy.teamReport.agingTitle} role="group">
        {rows.map(([label, bucket]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <span>
              {label} <span className="cap">· {copy.teamReport.owedCount(bucket.count)}</span>
            </span>
            <b>{money(bucket.total)}</b>
          </div>
        ))}
      </div>
    </section>
  );
}

function Compare({ detail, money }: { detail: SellerDetail; money: Money }) {
  const { previous, seller } = detail;
  return (
    <section className="glass2 card flex flex-col gap-3" aria-label={copy.teamReport.compareTitle}>
      <h2 className="h2" style={{ fontSize: 16 }}>
        {copy.teamReport.compareTitle}
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <Stat label={copy.teamReport.compareNow} value={money(seller.salesTotal)} />
        <Stat label={formatRange(previous.from, previous.to)} value={money(previous.salesTotal)} />
      </div>
      <span className="cap">
        {formatRange(detail.from, detail.to)} · {copy.teamReport.salesCount(seller.salesCount)}
      </span>
    </section>
  );
}

const formatRange = (from: string, to: string) =>
  from === to ? formatShortDate(from) : `${formatShortDate(from)} a ${formatShortDate(to)}`;

function Daily({ detail, money }: { detail: SellerDetail; money: Money }) {
  const max = detail.daily.reduce((top, day) => Math.max(top, Number(day.salesTotal)), 0);
  if (max === 0) return null;
  return (
    <section className="glass2 card flex flex-col gap-3" aria-label={copy.teamReport.dailyTitle}>
      <h2 className="h2" style={{ fontSize: 16 }}>
        {copy.teamReport.dailyTitle}
      </h2>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {detail.daily.map((day) => (
          <li key={day.date}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="cap">{formatShortDate(day.date)}</span>
              <b>{money(day.salesTotal)}</b>
            </div>
            <div className="bar" aria-hidden="true">
              <i style={{ width: `${Math.round((Number(day.salesTotal) / max) * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Utilization({ detail }: { detail: SellerDetail }) {
  const { utilization } = detail;
  return (
    <section
      className="glass2 card flex flex-col gap-3"
      aria-label={copy.teamReport.utilizationTitle}
    >
      <h2 className="h2" style={{ fontSize: 16 }}>
        {copy.teamReport.utilizationTitle}
      </h2>
      {utilization.products === 0 ? (
        <p className="sub m-0">{copy.teamReport.noPreparation}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat label={copy.teamReport.prepared} value={utilization.preparedUnits} />
            <Stat label={copy.teamReport.sold} value={utilization.soldUnits} />
          </div>
          {utilization.soldPercent !== null ? (
            <div>
              <div className="bar" aria-hidden="true">
                <i
                  style={{
                    width: `${Math.min(100, Math.round(Number(utilization.soldPercent)))}%`,
                  }}
                />
              </div>
              <div className="cap">{copy.teamReport.soldPercent(utilization.soldPercent)}</div>
            </div>
          ) : null}
          {utilization.soldOutProducts > 0 ? (
            <span className="bdg bdg-pen self-start">
              {copy.teamReport.soldOut(utilization.soldOutProducts)}
            </span>
          ) : null}
        </>
      )}
    </section>
  );
}

/** Detalle de una persona: sus cifras, lo que se le debe, comparativo, serie diaria y aprovechamiento (RF-145). */
export function SellerDetailPage() {
  const { id } = useParams();
  const currency = useCurrency();
  const money: Money = (amount) => formatMoney(amount, currency);
  const control = usePeriodControl('week');
  const query = useSellerDetail(id, control.kind, control.waitingForRange ? null : control.period);
  const detail = query.data;

  return (
    <>
      <PageHeader
        title={detail?.seller.name ?? copy.teamReport.title}
        back={{ to: '/reportes/equipo', label: copy.teamReport.detailBack }}
      />
      <PeriodPicker control={control} />

      {control.waitingForRange ? null : query.isPending ? (
        <LoadingRegion label={copy.states.loading}>
          <div className="flex flex-col gap-3">
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
          </div>
        </LoadingRegion>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : detail ? (
        <>
          {detail.seller.status === 'disabled' ? (
            <Banner tone="info">{copy.teamReport.disabled}</Banner>
          ) : null}
          <Owed detail={detail} money={money} />
          <ReportBody
            report={{
              ...detail.seller,
              from: detail.from,
              to: detail.to,
              topProducts: detail.topProducts,
            }}
            money={money}
            currency={currency}
          />
          <Compare detail={detail} money={money} />
          <Daily detail={detail} money={money} />
          <Utilization detail={detail} />
        </>
      ) : null}
    </>
  );
}
