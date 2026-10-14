import { formatMoney, type SellerReportRow, type SellersReport } from '@pos/shared';
import { Users } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageHeader } from '../../components/PageHeader';
import { LoadingRegion, MetricSkeleton } from '../../components/Skeleton';
import { Stat } from '../../components/Stat';
import { copy } from '../../copy/es';
import { useCurrency } from '../store/useStore';
import { PeriodPicker, usePeriodControl } from './PeriodPicker';
import { useSellersReport } from './useTeamReport';

const unsigned = (amount: string) => amount.replace(/^-/, '');

function PersonCard({ row, money }: { row: SellerReportRow; money: (amount: string) => string }) {
  const loss = row.isGrossLoss;
  const owes = row.owed.count > 0;
  return (
    <li>
      <Link
        to={`/reportes/equipo/${row.userId}`}
        className="glass2 card flex flex-col gap-3 text-inherit no-underline"
        aria-label={copy.teamReport.open(row.name)}
      >
        <div className="flex items-start gap-2">
          <div className="h2 min-w-0 flex-1 break-words" style={{ fontSize: 16 }}>
            {row.name}
          </div>
          {row.role === 'owner' ? (
            <span className="bdg bdg-mut">{copy.teamReport.owner}</span>
          ) : row.status === 'disabled' ? (
            <span className="bdg bdg-can">{copy.teamReport.disabled}</span>
          ) : null}
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-extrabold" style={{ fontSize: 28, letterSpacing: '-0.03em' }}>
            {money(row.salesTotal)}
          </span>
          <span className="cap">{copy.teamReport.salesCount(row.salesCount)}</span>
        </div>
        {row.share !== null ? (
          <div>
            <div className="bar" aria-hidden="true">
              <i style={{ width: `${Math.min(100, Math.round(Number(row.share)))}%` }} />
            </div>
            <div className="cap">{copy.teamReport.share(row.share)}</div>
          </div>
        ) : null}
        <div className="grid grid-cols-3 gap-3">
          <Stat
            label={loss ? copy.teamReport.loss : copy.teamReport.profit}
            value={money(unsigned(row.grossProfit))}
          />
          <Stat label={copy.teamReport.collected} value={money(row.collected)} />
          <Stat label={copy.teamReport.owed} value={money(row.owed.total)} />
        </div>
        {owes ? (
          <div className="cap">
            {copy.teamReport.owedCount(row.owed.count)} · {copy.teamReport.owedNote}
          </div>
        ) : null}
        {row.cancelled.count > 0 ? (
          <span className="bdg bdg-can self-start">
            {copy.teamReport.cancelled(row.cancelled.count)}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

function Totals({ report, money }: { report: SellersReport; money: (amount: string) => string }) {
  const { totals } = report;
  const loss = totals.grossProfit.startsWith('-');
  return (
    <section className="glass card flex flex-col gap-3" aria-label={copy.teamReport.totalsTitle}>
      <h2 className="h2" style={{ fontSize: 16 }}>
        {copy.teamReport.totalsTitle}
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <Stat label={copy.teamReport.sales} value={money(totals.salesTotal)} />
        <Stat
          label={loss ? copy.teamReport.loss : copy.teamReport.profit}
          value={money(unsigned(totals.grossProfit))}
        />
        <Stat label={copy.teamReport.collected} value={money(totals.collected)} />
        <Stat label={copy.teamReport.owedAll} value={money(totals.owed.total)} />
      </div>
      <span className="cap">{copy.teamReport.owedCount(totals.owed.count)}</span>
    </section>
  );
}

/** Ventas, utilidad bruta y lo que se debe de cada persona de la tienda (RF-142 a RF-144). Solo el propietario. */
export function TeamReportPage() {
  const currency = useCurrency();
  const money = (amount: string) => formatMoney(amount, currency);
  const control = usePeriodControl('week');
  const query = useSellersReport(control.kind, control.waitingForRange ? null : control.period);
  const report = query.data;

  return (
    <>
      <PageHeader
        title={copy.teamReport.title}
        back={{ to: '/mas', label: copy.teamReport.back }}
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
      ) : report && !report.hasSellers ? (
        <EmptyState
          icon={Users}
          title={copy.teamReport.emptyTitle}
          text={copy.teamReport.emptyText}
          action={
            <Link to="/equipo" className="btn btn-p">
              {copy.teamReport.emptyAction}
            </Link>
          }
        />
      ) : report ? (
        <>
          <Totals report={report} money={money} />
          <ul
            aria-label={copy.teamReport.listLabel}
            className="stagger m-0 flex list-none flex-col gap-3 p-0"
          >
            {report.items.map((row) => (
              <PersonCard key={row.userId} row={row} money={money} />
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}
