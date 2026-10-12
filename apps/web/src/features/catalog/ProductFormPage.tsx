import type { Product } from '@pos/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { ErrorState } from '../../components/ErrorState';
import { Field, TextAreaField } from '../../components/Field';
import { useOnline } from '../../components/OfflineBanner';
import { PageHeader } from '../../components/PageHeader';
import { LoadingRegion, Skeleton } from '../../components/Skeleton';
import { Switch } from '../../components/Switch';
import { useToast } from '../../components/Toast';
import { copy } from '../../copy/es';
import { api, ApiError } from '../../lib/api';
import { messageOf } from '../../lib/errors';
import { useUnsavedGuard } from '../../lib/useUnsavedGuard';
import {
  changedFields,
  EMPTY_FORM,
  formFromProduct,
  validateProductForm,
  type ProductFormValues,
} from './productForm';
import { productKey, useProduct } from './useProducts';

type Errors = Partial<Record<keyof ProductFormValues, string>>;

export function ProductFormPage() {
  const { id } = useParams();
  const query = useProduct(id);

  if (id === undefined) return <ProductForm product={undefined} />;
  if (query.isPending) {
    return (
      <>
        <PageHeader
          title={copy.product.editTitle}
          back={{ to: '/catalogo', label: copy.product.back }}
        />
        <LoadingRegion label={copy.states.loading}>
          <div className="glass2 card flex flex-col gap-4">
            {[0, 1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-12 w-full" />
            ))}
          </div>
        </LoadingRegion>
      </>
    );
  }
  if (query.isError) {
    return (
      <>
        <PageHeader
          title={copy.product.editTitle}
          back={{ to: '/catalogo', label: copy.product.back }}
        />
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </>
    );
  }
  // `key` reinicia el formulario cuando se carga otra versión del producto.
  return <ProductForm key={query.data.version} product={query.data} />;
}

function ProductForm({ product }: { product: Product | undefined }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const initial = useMemo(() => (product ? formFromProduct(product) : EMPTY_FORM), [product]);
  const [values, setValues] = useState<ProductFormValues>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const guard = useUnsavedGuard(dirty && !saving);

  const set = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  function showErrors(found: Errors) {
    setErrors(found);
    setFailure(copy.product.notSaved);
    const first = (Object.keys(found) as (keyof ProductFormValues)[])[0];
    if (first) document.getElementById(`product-${first}`)?.focus();
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setFailure(null);
    setStale(false);

    const checked = validateProductForm(values);
    if (!checked.ok) return showErrors(checked.errors);

    setSaving(true);
    try {
      if (product) {
        const base = validateProductForm(initial);
        const changes = changedFields(base.ok ? base.data : {}, checked.data);
        const body = {
          ...changes,
          ...(values.active !== product.active ? { active: values.active } : {}),
        };
        if (Object.keys(body).length === 0) {
          toast.show('info', copy.product.noChanges);
        } else {
          await api.patch<Product>(`/products/${product.id}`, {
            version: product.version,
            ...body,
          });
        }
      } else {
        await api.post<Product>('/products', checked.data);
      }
      guard.allowLeave();
      await client.invalidateQueries({ queryKey: ['products'] });
      client.removeQueries({ queryKey: productKey(product?.id ?? '') });
      toast.show('ok', copy.product.saved);
      void navigate('/catalogo');
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && !error.fields.code) {
        setStale(true);
      } else if (error instanceof ApiError && Object.keys(error.fields).length > 0) {
        showErrors(error.fields as Errors);
      } else {
        setFailure(messageOf(error));
      }
    } finally {
      setSaving(false);
    }
  }

  const title = product ? copy.product.editTitle : copy.product.newTitle;
  const field = (key: keyof ProductFormValues) => ({
    id: `product-${key}`,
    error: errors[key],
  });

  return (
    <>
      <PageHeader title={title} back={{ to: '/catalogo', label: copy.product.back }} />

      {failure ? <Banner tone="bad">{failure}</Banner> : null}
      {stale ? (
        <Banner tone="warn">
          <p className="m-0">{copy.product.changedElsewhere}</p>
          <Button
            className="mt-2"
            onClick={() => {
              void client.invalidateQueries({ queryKey: productKey(product?.id ?? '') });
              setStale(false);
              setFailure(null);
            }}
          >
            {copy.product.reload}
          </Button>
        </Banner>
      ) : null}

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div className="glass2 card flex flex-col gap-4">
          <Field
            {...field('name')}
            label={`${copy.product.name} *`}
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            autoComplete="off"
            maxLength={100}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              {...field('price')}
              label={`${copy.product.price} *`}
              value={values.price}
              onChange={(e) => set('price', e.target.value)}
              inputMode="decimal"
              autoComplete="off"
            />
            <Field
              {...field('cost')}
              label={`${copy.product.cost} *`}
              value={values.cost}
              onChange={(e) => set('cost', e.target.value)}
              inputMode="decimal"
              autoComplete="off"
              hint={copy.product.costHint}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              {...field('unit')}
              label={copy.product.unit}
              value={values.unit}
              onChange={(e) => set('unit', e.target.value)}
              autoComplete="off"
              maxLength={20}
            />
            <Field
              {...field('code')}
              label={copy.product.code}
              value={values.code}
              onChange={(e) => set('code', e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              maxLength={40}
            />
          </div>
          <Field
            {...field('category')}
            label={copy.product.category}
            placeholder={copy.product.optional}
            value={values.category}
            onChange={(e) => set('category', e.target.value)}
            autoComplete="off"
            maxLength={60}
          />
          <TextAreaField
            {...field('description')}
            label={copy.product.description}
            placeholder={copy.product.optional}
            value={values.description}
            onChange={(e) => set('description', e.target.value)}
            maxLength={500}
          />
          <TextAreaField
            {...field('notes')}
            label={copy.product.notes}
            placeholder={copy.product.optional}
            value={values.notes}
            onChange={(e) => set('notes', e.target.value)}
            maxLength={500}
          />
          {product ? (
            <div className="flex items-center justify-between gap-3">
              <span className="h2" style={{ fontSize: 16 }}>
                {copy.product.active}
              </span>
              <Switch
                checked={values.active}
                label={copy.product.active}
                onChange={(next) => set('active', next)}
              />
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-[1fr_1.4fr] gap-3">
          <Button large onClick={() => void navigate('/catalogo')}>
            {copy.product.cancel}
          </Button>
          <Button type="submit" variant="primary" large loading={saving} disabled={!online}>
            {copy.product.save}
          </Button>
        </div>
      </form>
      {guard.dialog}
    </>
  );
}
