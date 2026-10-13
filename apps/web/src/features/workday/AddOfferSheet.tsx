import { addOfferSchema, type Product } from '@pos/shared';
import { useState, type FormEvent } from 'react';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { QuantityField } from '../../components/QuantityField';
import { SearchField } from '../../components/SearchField';
import { Sheet } from '../../components/Sheet';
import { RowSkeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';
import { copy } from '../../copy/es';
import { ApiError } from '../../lib/api';
import { messageOf } from '../../lib/errors';
import { useDebounced } from '../../lib/useDebounced';
import { useProducts } from '../catalog/useProducts';
import { useAddOffer } from './useWorkday';

/** Agrega un producto activo al día con su cantidad inicial (RF-028, RF-029). */
export function AddOfferSheet({
  date,
  takenProductIds,
  online,
  onClose,
  onAdded,
}: {
  date: string;
  takenProductIds: ReadonlySet<string>;
  online: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const products = useProducts(q, 'active');
  const add = useAddOffer(date);
  const [selected, setSelected] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const available = (products.data?.pages.flatMap((page) => page.items) ?? []).filter(
    (product) => !takenProductIds.has(product.id),
  );

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selected || add.isPending) return;
    setFailure(null);
    const checked = addOfferSchema.safeParse({ productId: selected.id, quantity });
    if (!checked.success) {
      setError(checked.error.issues.find((i) => i.path[0] === 'quantity')?.message ?? null);
      document.getElementById('offer-quantity')?.focus();
      return;
    }
    if (!selected.allowsFractions && checked.data.quantity.includes('.')) {
      setError('Este producto se vende en piezas enteras.');
      return;
    }
    setError(null);
    add.mutate(checked.data, {
      onSuccess: onAdded,
      onError: (e) => {
        if (e instanceof ApiError && e.fields.quantity) setError(e.fields.quantity);
        else setFailure(messageOf(e));
      },
    });
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => (!open ? onClose() : undefined)}
      title={copy.day.addProduct}
      closeLabel={copy.day.close}
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {failure ? <Banner tone="bad">{failure}</Banner> : null}

        <SearchField
          label={copy.day.searchProducts}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <div className="glass overflow-hidden p-0" style={{ maxHeight: 240, overflowY: 'auto' }}>
          {products.isPending ? (
            [0, 1, 2].map((n) => <RowSkeleton key={n} />)
          ) : products.isError ? (
            <ErrorState error={products.error} onRetry={() => void products.refetch()} />
          ) : available.length === 0 ? (
            <div className="p-4">
              <p className="h2" style={{ fontSize: 16 }}>
                {copy.day.noProductsTitle}
              </p>
              <p className="sub">{copy.day.noProductsText}</p>
            </div>
          ) : (
            <ul className="m-0 list-none p-0" aria-label={copy.day.pickProduct}>
              {available.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    className="li w-full text-left"
                    style={{
                      background: 'transparent',
                      border: 0,
                      font: 'inherit',
                      color: 'inherit',
                      cursor: 'pointer',
                    }}
                    aria-pressed={selected?.id === product.id}
                    onClick={() => {
                      setSelected(product);
                      setError(null);
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">{product.name}</span>
                      <span className="cap">
                        {[product.code, product.unit].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    {selected?.id === product.id ? (
                      <span className="bdg bdg-ok">Elegido</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selected ? (
          <QuantityField
            id="offer-quantity"
            label={copy.day.quantity}
            value={quantity}
            onChange={(value) => {
              setQuantity(value);
              setError(null);
            }}
            error={error ?? undefined}
            fractions={selected.allowsFractions}
          />
        ) : null}

        <Button
          type="submit"
          variant="primary"
          large
          block
          loading={add.isPending}
          disabled={!selected || !online}
        >
          {copy.day.addToDay}
        </Button>
      </form>
    </Sheet>
  );
}
