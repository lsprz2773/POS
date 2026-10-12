import { formatMoney, type Product } from '@pos/shared';
import { Package, PackageSearch, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { useOnline } from '../../components/OfflineBanner';
import { PageHeader } from '../../components/PageHeader';
import { SearchField } from '../../components/SearchField';
import { Segmented } from '../../components/Segmented';
import { LoadingRegion, RowSkeleton } from '../../components/Skeleton';
import { Switch } from '../../components/Switch';
import { useToast } from '../../components/Toast';
import { copy } from '../../copy/es';
import { ApiError } from '../../lib/api';
import { messageOf } from '../../lib/errors';
import { useDebounced } from '../../lib/useDebounced';
import { useCurrency } from '../store/useStore';
import { useProducts, useToggleProduct, type StatusFilter } from './useProducts';

const FILTERS = [
  { value: 'active', label: copy.catalog.active },
  { value: 'inactive', label: copy.catalog.inactive },
  { value: 'all', label: copy.catalog.all },
] as const;

function ProductRow({
  product,
  disabled,
  currency,
}: {
  product: Product;
  disabled: boolean;
  currency: string;
}) {
  const toggle = useToggleProduct();
  const toast = useToast();
  const subtitle = [product.code, product.unit].filter(Boolean).join(' · ');

  function change(active: boolean) {
    toggle.mutate(
      { id: product.id, version: product.version, active },
      {
        onSuccess: () =>
          toast.show('ok', active ? copy.catalog.activated : copy.catalog.deactivated),
        onError: (error) =>
          toast.show(
            'bad',
            error instanceof ApiError && error.status === 409
              ? error.message
              : `${copy.catalog.toggleFailed} ${messageOf(error)}`,
          ),
      },
    );
  }

  return (
    <li className="li" style={product.active ? undefined : { opacity: 0.85 }}>
      <Link
        to={`/catalogo/${product.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 text-inherit no-underline"
      >
        <div className="min-w-0 flex-1">
          <div className="h2 break-words" style={{ fontSize: 16 }}>
            {product.name}
            {product.active ? null : (
              <span className="bdg bdg-mut ml-2 align-middle">{copy.catalog.inactiveBadge}</span>
            )}
          </div>
          {subtitle ? <div className="cap">{subtitle}</div> : null}
        </div>
        <div className="text-right">
          <div className="font-extrabold">{formatMoney(product.price, currency)}</div>
          <div className="cap">
            {copy.catalog.cost} {formatMoney(product.cost, currency)}
          </div>
        </div>
      </Link>
      <Switch
        checked={product.active}
        label={
          product.active
            ? copy.catalog.toggleOn(product.name)
            : copy.catalog.toggleOff(product.name)
        }
        disabled={disabled}
        busy={toggle.isPending}
        onChange={change}
      />
    </li>
  );
}

export function CatalogPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('active');
  const q = useDebounced(search.trim());
  const online = useOnline();
  const currency = useCurrency();
  const query = useProducts(q, status);
  const products = query.data?.pages.flatMap((page) => page.items) ?? [];
  const filtering = q !== '' || status !== 'active';

  return (
    <>
      <PageHeader
        title={copy.catalog.title}
        back={{ to: '/mas', label: copy.catalog.back }}
        action={
          <Link to="/catalogo/nuevo" className="btn btn-p">
            <Plus className="ic" aria-hidden="true" />
            {copy.catalog.add}
          </Link>
        }
      />
      <SearchField
        label={copy.catalog.search}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <Segmented
        label={copy.catalog.filter}
        value={status}
        options={FILTERS}
        onChange={setStatus}
      />

      {query.isPending ? (
        <LoadingRegion label={copy.states.loading}>
          <div className="glass2 overflow-hidden p-0">
            {[0, 1, 2, 3, 4].map((n) => (
              <RowSkeleton key={n} />
            ))}
          </div>
        </LoadingRegion>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : products.length === 0 ? (
        filtering ? (
          <EmptyState
            icon={PackageSearch}
            title={copy.catalog.noResultsTitle}
            text={copy.catalog.noResultsText}
          />
        ) : (
          <EmptyState
            icon={Package}
            title={copy.catalog.emptyTitle}
            text={copy.catalog.emptyText}
            action={
              <Link to="/catalogo/nuevo" className="btn btn-p">
                {copy.catalog.emptyAction}
              </Link>
            }
          />
        )
      ) : (
        <>
          <ul className="glass2 m-0 list-none overflow-hidden p-0">
            {products.map((product) => (
              <ProductRow
                key={product.id}
                product={product}
                disabled={!online}
                currency={currency}
              />
            ))}
          </ul>
          {query.hasNextPage ? (
            <Button
              block
              loading={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {copy.catalog.loadMore}
            </Button>
          ) : null}
          <p className="cap text-center">{copy.catalog.note}</p>
        </>
      )}
    </>
  );
}
