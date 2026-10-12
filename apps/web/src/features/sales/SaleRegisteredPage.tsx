import { formatMoney, type Sale } from '@pos/shared';
import { CheckCircle2 } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { ErrorState } from '../../components/ErrorState';
import { LoadingRegion, Skeleton } from '../../components/Skeleton';
import { StatusBadge } from '../../components/StatusBadge';
import { copy } from '../../copy/es';
import { useCurrency } from '../store/useStore';
import { useSale } from './useSales';

const methodLabel = (method: 'cash' | 'transfer') =>
  method === 'cash' ? copy.sale.cash.toLowerCase() : copy.sale.transfer.toLowerCase();

function methodsOf(sale: Sale): string {
  const used = [...new Set(sale.payments.filter((p) => p.status === 'valid').map((p) => p.method))];
  return used.length === 0 ? '' : ` (${used.map(methodLabel).join(' y ')})`;
}

/** Confirmación explícita del servidor: solo se muestra con la venta ya guardada (RNF-055). */
export function SaleRegisteredPage() {
  const { id } = useParams();
  const query = useSale(id);
  const currency = useCurrency();
  const money = (amount: string) => formatMoney(amount, currency);

  if (query.isPending) {
    return (
      <LoadingRegion label={copy.states.loading}>
        <Skeleton className="mx-auto h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </LoadingRegion>
    );
  }
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const sale = query.data;

  return (
    <>
      <div className="flex flex-col items-center gap-2 pt-4 text-center">
        <CheckCircle2 className="h-14 w-14" style={{ color: 'var(--ok)' }} aria-hidden="true" />
        {/* El título es un encabezado; el aviso vivo lo anuncia sin quitarle ese papel. */}
        <div role="status">
          <h1 className="h1" tabIndex={-1}>
            {copy.sale.registeredTitle}
          </h1>
        </div>
        <p className="sub m-0">{copy.sale.registeredText}</p>
      </div>

      <dl className="glass2 card m-0 flex flex-col gap-3">
        {(
          [
            [copy.sale.folio, sale.folio],
            [copy.sale.total, money(sale.total)],
            [`${copy.sale.received}${methodsOf(sale)}`, money(sale.paid)],
            [copy.sale.missing, money(sale.balance)],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="sub">{label}</dt>
            <dd className="m-0 font-bold">{value}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3">
          <dt className="sub">{copy.sale.status}</dt>
          <dd className="m-0">
            <StatusBadge status={sale.paymentStatus} />
          </dd>
        </div>
      </dl>

      <div className="flex flex-col gap-2">
        <Link to="/vender" className="btn btn-p btn-lg btn-block">
          {copy.sale.newSale}
        </Link>
        <Link to={`/ventas/${sale.id}`} className="btn btn-s btn-lg btn-block">
          {copy.sale.viewDetail}
        </Link>
        <Link to="/" className="btn btn-g btn-block">
          {copy.sale.backToday}
        </Link>
      </div>
    </>
  );
}
