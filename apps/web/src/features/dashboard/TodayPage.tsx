import { formatMoney } from '@pos/shared';
import { UserRound } from 'lucide-react';
import { Link } from 'react-router';
import { Banner } from '../../components/Banner';
import { ErrorState } from '../../components/ErrorState';
import { LoadingRegion, MetricSkeleton } from '../../components/Skeleton';
import { MethodBreakdown } from '../../components/MethodBreakdown';
import { copy } from '../../copy/es';
import { formatBusinessDate } from '../../lib/format';
import { useCurrency } from '../store/useStore';
import { useDashboard } from '../reports/useReport';

/** Pantalla principal: lo que importa del día en pocos números y la venta a un toque (RF-079, RNF-044). */
export function TodayPage() {
  const query = useDashboard();
  const currency = useCurrency();
  const money = (amount: string) => formatMoney(amount, currency);
  const data = query.data;
  const date = data ? formatBusinessDate(data.date) : '';

  return (
    <>
      <header className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="h1" tabIndex={-1}>
            {copy.today.title}
          </h1>
          {date ? <div className="sub">{date.charAt(0).toUpperCase() + date.slice(1)}</div> : null}
        </div>
        <Link to="/perfil" className="iconbtn" aria-label={copy.today.profile}>
          <UserRound className="ic" aria-hidden="true" />
        </Link>
      </header>

      <Link to="/vender" className="btn btn-p btn-lg btn-block">
        {copy.today.newSale}
      </Link>

      {query.isPending ? (
        <LoadingRegion label={copy.states.loading}>
          <div className="flex flex-col gap-3">
            <MetricSkeleton />
            <div className="grid grid-cols-2 gap-3">
              <MetricSkeleton />
              <MetricSkeleton />
            </div>
            <MetricSkeleton />
          </div>
        </LoadingRegion>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : data ? (
        <>
          {!data.dayPrepared ? (
            <Banner tone="warn">
              <p className="m-0">{copy.today.dayNotPrepared}</p>
              <Link to="/dia" className="btn btn-s mt-2">
                {copy.today.prepareDay}
              </Link>
            </Banner>
          ) : null}

          <section
            className="glass card flex flex-col gap-1"
            aria-label={copy.today.salesOfDay(data.salesCount)}
          >
            <span className="sub">{copy.today.salesOfDay(data.salesCount)}</span>
            <span className="font-extrabold" style={{ fontSize: 32, letterSpacing: '-0.03em' }}>
              {money(data.salesTotal)}
            </span>
            {data.salesCount === 0 ? <span className="cap">{copy.today.noSalesYet}</span> : null}
          </section>

          <div className="grid grid-cols-2 gap-3">
            <section className="glass card flex flex-col gap-1" aria-label={copy.today.collected}>
              <span className="sub">{copy.today.collected}</span>
              <span className="font-extrabold" style={{ fontSize: 22 }}>
                {money(data.collected)}
              </span>
            </section>
            <Link
              to="/pendientes"
              className="glass card flex flex-col gap-1 text-inherit no-underline"
            >
              <span className="sub">{copy.today.toCollect}</span>
              <span className="font-extrabold" style={{ fontSize: 22 }}>
                {money(data.pendingTotal)}
              </span>
              <span className={`bdg self-start ${data.pendingCount === 0 ? 'bdg-ok' : 'bdg-pen'}`}>
                {data.pendingCount === 0
                  ? copy.today.allCollected
                  : copy.today.pendingCount(data.pendingCount)}
              </span>
            </Link>
          </div>

          <section className="glass2 card flex flex-col gap-3" aria-label={copy.today.byMethod}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="h2" style={{ fontSize: 16 }}>
                {copy.today.byMethod}
              </h2>
              <span className="cap">{copy.today.todayLabel}</span>
            </div>
            <MethodBreakdown
              cash={data.collectedByMethod.cash}
              transfer={data.collectedByMethod.transfer}
              currency={currency}
              labels={{ cash: copy.today.cash, transfer: copy.today.transfer }}
            />
          </section>

          <section className="glass2 card flex flex-col gap-2" aria-label={copy.today.grossProfit}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="h2" style={{ fontSize: 16 }}>
                {data.isGrossLoss ? copy.today.grossLoss : copy.today.grossProfit}
              </h2>
              <b style={{ fontSize: 22 }}>{money(data.estimatedGrossProfit.replace(/^-/, ''))}</b>
            </div>
            <span className="cap">{copy.today.grossNote}</span>
          </section>
        </>
      ) : null}
    </>
  );
}
