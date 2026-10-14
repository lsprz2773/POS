import { formatMoney, type Report } from '@pos/shared';
import { Banner } from '../../components/Banner';
import { ErrorState } from '../../components/ErrorState';
import { MethodBreakdown } from '../../components/MethodBreakdown';
import { PageHeader } from '../../components/PageHeader';
import { LoadingRegion, MetricSkeleton } from '../../components/Skeleton';
import { copy } from '../../copy/es';
import { useCurrency } from '../store/useStore';
import { PeriodPicker, usePeriodControl } from './PeriodPicker';
import { useReport } from './useReport';

/** Reportes por día, semana, mes o rango, con las definiciones de dominio.md (RF-081 a RF-105). */
export function ReportsPage() {
  const currency = useCurrency();
  const money = (amount: string) => formatMoney(amount, currency);
  const control = usePeriodControl('week');
  const query = useReport(control.kind, control.waitingForRange ? null : control.period);
  const report = query.data;

  return (
    <>
      <PageHeader title={copy.reports.title} back={{ to: '/mas', label: copy.reports.back }} />
      <PeriodPicker control={control} />

      {control.waitingForRange ? null : query.isPending ? (
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
      ) : report ? (
        <ReportBody report={report} money={money} currency={currency} />
      ) : null}
    </>
  );
}

export function ReportBody({
  report,
  money,
  currency,
}: {
  report: Report;
  money: (amount: string) => string;
  currency: string;
}) {
  const loss = report.isGrossLoss;
  const unsigned = (amount: string) => amount.replace(/^-/, '');
  return (
    <>
      {report.salesCount === 0 && report.cancelled.count === 0 ? (
        <Banner tone="info">{copy.reports.emptyPeriod}</Banner>
      ) : null}

      <section
        className="glass card flex flex-col gap-1"
        aria-label={copy.reports.sales(report.salesCount)}
      >
        <span className="sub">{copy.reports.sales(report.salesCount)}</span>
        <span className="font-extrabold" style={{ fontSize: 32, letterSpacing: '-0.03em' }}>
          {money(report.salesTotal)}
        </span>
        <span className="sub">
          {copy.reports.units(report.unitsSold, money(report.averageTicket))}
        </span>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <section className="glass card flex flex-col gap-1" aria-label={copy.reports.collected}>
          <span className="sub">{copy.reports.collected}</span>
          <span className="font-extrabold" style={{ fontSize: 22 }}>
            {money(report.collected)}
          </span>
          <span className="cap">{copy.reports.byPaymentDate}</span>
        </section>
        <section className="glass card flex flex-col gap-1" aria-label={copy.reports.pending}>
          <span className="sub">{copy.reports.pending}</span>
          <span className="font-extrabold" style={{ fontSize: 22 }}>
            {money(report.pending)}
          </span>
          <span className="cap">{copy.reports.pendingNote}</span>
        </section>
      </div>

      <section className="glass2 card flex flex-col gap-3" aria-label={copy.reports.byMethod}>
        <h2 className="h2" style={{ fontSize: 16 }}>
          {copy.reports.byMethod}
        </h2>
        <MethodBreakdown
          cash={report.collectedByMethod.cash}
          transfer={report.collectedByMethod.transfer}
          currency={currency}
          labels={{ cash: copy.reports.cash, transfer: copy.reports.transfer }}
          showPercent
        />
      </section>

      <section className="glass2 card flex flex-col gap-2" aria-label={copy.reports.grossTitle}>
        <h2 className="h2" style={{ fontSize: 16 }}>
          {loss ? copy.reports.lossTitle : copy.reports.grossTitle}
        </h2>
        <div className="flex items-baseline justify-between gap-3">
          <span className="sub">{copy.reports.salesLine}</span>
          <b>{money(report.salesTotal)}</b>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="sub">{copy.reports.costLine}</span>
          <b>− {money(report.costOfGoodsSold)}</b>
        </div>
        <hr style={{ border: 0, borderTop: '1px solid var(--hair)', width: '100%' }} />
        <div className="flex items-baseline justify-between gap-3">
          <b>{loss ? copy.reports.lossTitle : copy.reports.grossTitle}</b>
          <b style={{ fontSize: 22 }}>{money(unsigned(report.grossProfit))}</b>
        </div>
        {report.grossMargin !== null ? (
          <div className="flex items-baseline justify-between gap-3">
            <span className="sub">{copy.reports.grossMargin}</span>
            <b>{loss ? `− ${unsigned(report.grossMargin)}` : report.grossMargin} %</b>
          </div>
        ) : null}
        <Banner tone="info">{copy.reports.notNet}</Banner>
      </section>

      <section className="glass2 card flex flex-col gap-3" aria-label={copy.reports.topProducts}>
        <h2 className="h2" style={{ fontSize: 16 }}>
          {copy.reports.topProducts}
        </h2>
        {report.topProducts.length === 0 ? (
          <p className="sub m-0">{copy.reports.topEmpty}</p>
        ) : (
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {report.topProducts.map((product, index) => (
              <li key={product.productId} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 break-words">
                  {index + 1}. {product.name}
                </span>
                <b>{copy.reports.pieces(product.units)}</b>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="glass2 card flex flex-col gap-2" aria-label={copy.reports.cancelledTitle}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="h2" style={{ fontSize: 16 }}>
            {copy.reports.cancelledTitle}
          </h2>
          <span className="bdg bdg-can">
            {copy.reports.cancelledSummary(report.cancelled.count, money(report.cancelled.total))}
          </span>
        </div>
        <span className="sub">{copy.reports.cancelledNote}</span>
        {report.cancelled.refundDue !== '0.00' ? (
          <Banner tone="info">{copy.reports.refund(money(report.cancelled.refundDue))}</Banner>
        ) : null}
      </section>
    </>
  );
}
