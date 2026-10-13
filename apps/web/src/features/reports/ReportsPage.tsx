import { formatMoney, MAX_REPORT_DAYS, type Report } from '@pos/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { ErrorState } from '../../components/ErrorState';
import { Field } from '../../components/Field';
import { MethodBreakdown } from '../../components/MethodBreakdown';
import { PageHeader } from '../../components/PageHeader';
import { Segmented } from '../../components/Segmented';
import { LoadingRegion, MetricSkeleton } from '../../components/Skeleton';
import { copy } from '../../copy/es';
import { useCurrency, useToday } from '../store/useStore';
import { periodAround, periodLabel, periodOnSwitch, shiftPeriod, type PeriodKind } from './periods';
import { useReport } from './useReport';

const KINDS = [
  { value: 'day', label: copy.reports.day },
  { value: 'week', label: copy.reports.week },
  { value: 'month', label: copy.reports.month },
  { value: 'range', label: copy.reports.range },
] as const;

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

/** Reportes por día, semana, mes o rango, con las definiciones de dominio.md (RF-081 a RF-105). */
export function ReportsPage() {
  const today = useToday();
  const currency = useCurrency();
  const money = (amount: string) => formatMoney(amount, currency);
  const [kind, setKind] = useState<PeriodKind>('week');
  const [anchor, setAnchor] = useState<{ from: string; to: string } | null>(null);
  const [draft, setDraft] = useState({ from: '', to: '' });
  const [rangeError, setRangeError] = useState<string | null>(null);

  // Periodo mostrado: el elegido o, por omisión, el que contiene hoy.
  const period = kind === 'range' ? anchor : (anchor ?? (today ? periodAround(kind, today) : null));
  const query = useReport(kind, kind === 'range' && !anchor ? null : period);
  const report = query.data;

  function changeKind(next: PeriodKind) {
    setKind(next);
    setRangeError(null);
    if (next === 'range') {
      setAnchor(null);
      return;
    }
    setAnchor(today ? periodOnSwitch(next, period, today) : null);
  }

  function shift(direction: 1 | -1) {
    if (kind === 'range' || !period) return;
    setAnchor(shiftPeriod(kind, period, direction));
  }

  function applyRange(event: FormEvent) {
    event.preventDefault();
    if (!draft.from || !draft.to) {
      setRangeError(copy.reports.required);
    } else if (draft.to < draft.from) {
      setRangeError(copy.reports.invalidRange);
    } else if (daysBetween(draft.from, draft.to) > MAX_REPORT_DAYS) {
      setRangeError(copy.reports.tooLong);
    } else {
      setRangeError(null);
      setAnchor({ from: draft.from, to: draft.to });
    }
  }

  const isFuture = !!period && !!today && period.to >= today;

  return (
    <>
      <PageHeader title={copy.reports.title} back={{ to: '/mas', label: copy.reports.back }} />
      <Segmented<PeriodKind>
        label={copy.reports.period}
        value={kind}
        options={KINDS}
        onChange={changeKind}
      />

      {kind === 'range' ? (
        <form onSubmit={applyRange} noValidate className="glass2 card flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field
              id="report-from"
              type="date"
              label={copy.reports.from}
              value={draft.from}
              onChange={(event) => setDraft({ ...draft, from: event.target.value })}
            />
            <Field
              id="report-to"
              type="date"
              label={copy.reports.to}
              value={draft.to}
              error={rangeError ?? undefined}
              onChange={(event) => setDraft({ ...draft, to: event.target.value })}
            />
          </div>
          <Button type="submit" variant="primary">
            {copy.reports.apply}
          </Button>
        </form>
      ) : period ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="iconbtn"
            aria-label={copy.reports.previous}
            onClick={() => shift(-1)}
          >
            <ChevronLeft className="ic" aria-hidden="true" />
          </button>
          <div
            className="glass2 card flex-1 text-center font-bold"
            style={{ padding: '10px 12px' }}
            aria-live="polite"
          >
            {periodLabel(kind, period)}
          </div>
          <button
            type="button"
            className="iconbtn"
            aria-label={copy.reports.next}
            disabled={isFuture}
            onClick={() => shift(1)}
          >
            <ChevronRight className="ic" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {kind === 'range' && !anchor ? null : query.isPending ? (
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

function ReportBody({
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
