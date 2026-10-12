import { formatMoney, sumMoney } from '@pos/shared';
import { percentOf } from '../features/reports/periods';

/** Reparto del cobro entre efectivo y transferencia, con barra y porcentaje (RF-092, RF-093). */
export function MethodBreakdown({
  cash,
  transfer,
  currency,
  labels,
  showPercent = false,
}: {
  cash: string;
  transfer: string;
  currency: string;
  labels: { cash: string; transfer: string };
  showPercent?: boolean;
}) {
  const cashPercent = percentOf(cash, sumMoney([cash, transfer]));
  const rows = [
    { label: labels.cash, amount: cash },
    { label: labels.transfer, amount: transfer },
  ];
  return (
    <>
      {cashPercent !== null ? (
        <div className="bar" aria-hidden="true">
          <i style={{ width: `${cashPercent}%` }} />
        </div>
      ) : null}
      {rows.map(({ label, amount }, index) => {
        const percent = cashPercent === null ? null : index === 0 ? cashPercent : 100 - cashPercent;
        return (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <span>{label}</span>
            <b>
              {formatMoney(amount, currency)}
              {showPercent && percent !== null ? <span className="cap"> {percent} %</span> : null}
            </b>
          </div>
        );
      })}
    </>
  );
}
