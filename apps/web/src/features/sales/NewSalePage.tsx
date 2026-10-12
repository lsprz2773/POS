import {
  balanceOf,
  formatMoney,
  isOutsideHours,
  type DailyOffer,
  type PaymentLinesInput,
} from '@pos/shared';
import { ChevronLeft, ShoppingCart } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Field } from '../../components/Field';
import { useOnline } from '../../components/OfflineBanner';
import { QuantityStepper } from '../../components/QuantityStepper';
import { SearchField } from '../../components/SearchField';
import { Segmented } from '../../components/Segmented';
import { LoadingRegion, RowSkeleton } from '../../components/Skeleton';
import { copy } from '../../copy/es';
import { ApiError } from '../../lib/api';
import { createIntentKeys } from '../../lib/idempotency';
import { messageOf } from '../../lib/errors';
import { useUnsavedGuard } from '../../lib/useUnsavedGuard';
import { clearDraft, loadDraft, saveDraft } from '../../lib/draft';
import { useSession } from '../session/useSession';
import { useStore, useToday } from '../store/useStore';
import { useWorkday } from '../workday/useWorkday';
import { cartLines, cartTotals, sellable, setQuantity, stepQuantity, type Cart } from './cart';
import { checkPayment, draftFor, type PaymentDraft } from './paymentLines';
import { PaymentSheet } from './PaymentSheet';
import { useCreateSale } from './useSales';

type Collect = 'now' | 'pending';

/** Nueva venta en dos pasos: productos y cobro. Nada se da por registrado sin la respuesta del servidor. */
export function NewSalePage() {
  const navigate = useNavigate();
  const online = useOnline();
  const today = useToday();
  const store = useStore();
  const currency = store.data?.currency ?? 'MXN';
  const money = (amount: string) => formatMoney(amount, currency);
  const workday = useWorkday(today);
  const create = useCreateSale();
  const keys = useRef(createIntentKeys());

  const [step, setStep] = useState<1 | 2>(1);
  const session = useSession();
  const tenantId = session.status === 'authenticated' ? session.me.tenant.id : undefined;
  // Si la sesión expiró a medio cobro, el borrador sigue aquí al volver a entrar (M7).
  const [saved] = useState(() => (tenantId ? loadDraft(tenantId) : null));
  const [cart, setCart] = useState<Cart>(saved?.cart ?? {});
  const [search, setSearch] = useState('');
  const [customer, setCustomer] = useState(saved?.customer ?? '');
  const [note, setNote] = useState(saved?.note ?? '');
  const [collect, setCollect] = useState<Collect>('now');
  const [payment, setPayment] = useState<PaymentDraft | null>(null);
  const [editingPayment, setEditingPayment] = useState(false);
  const [failure, setFailure] = useState<{ text: string; details: string[] } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ customer?: string; note?: string }>({});

  const offers = useMemo(() => workday.data?.offers ?? [], [workday.data]);
  const lines = useMemo(() => cartLines(offers, cart), [offers, cart]);
  const totals = cartTotals(lines);
  const hasItems = lines.length > 0;

  const guard = useUnsavedGuard(hasItems && !create.isPending);

  useEffect(() => {
    if (!tenantId) return;
    if (Object.keys(cart).length === 0) clearDraft();
    else saveDraft({ tenantId, cart, customer, note });
  }, [tenantId, cart, customer, note]);

  const visible = offers.filter((offer) =>
    offer.productName.toLowerCase().includes(search.trim().toLowerCase()),
  );

  // Cobro por omisión: todo en efectivo. Si el total cambia, se vuelve al valor por omisión.
  const draft = payment ?? draftFor('cash', totals.total);
  const check = checkPayment(draft, totals.total, money);
  const outside =
    workday.data && store.data
      ? isOutsideHours(store.data.timezone, new Date(), workday.data)
      : false;

  function change(next: Cart) {
    setCart(next);
    setPayment(null);
    setFailure(null);
  }

  async function confirm() {
    if (create.isPending || !hasItems) return;
    setFailure(null);
    setFieldErrors({});
    const body = {
      items: lines.map((line) => ({ productId: line.offer.productId, quantity: line.quantity })),
      ...(customer.trim() ? { customerReference: customer.trim() } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(collect === 'now' && check.ok ? { payments: check.lines as PaymentLinesInput } : {}),
    };
    const key = keys.current.keyFor(JSON.stringify(body));
    try {
      const sale = await create.mutateAsync({ key, body });
      keys.current.done();
      clearDraft();
      guard.allowLeave();
      void navigate(`/vender/listo/${sale.id}`, { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'insufficient_stock') {
        keys.current.done();
        setFailure({ text: copy.sale.notRegistered, details: Object.values(error.fields) });
        void workday.refetch();
        setStep(1);
      } else if (error instanceof ApiError && error.code === 'validation_error') {
        setFieldErrors({
          customer: error.fields.customerReference,
          note: error.fields.note,
        });
        setFailure({ text: copy.sale.notRegistered, details: Object.values(error.fields) });
      } else if (error instanceof ApiError && error.code === 'network') {
        // La llave se conserva: si la venta sí llegó, reintentar devuelve la misma sin duplicarla.
        setFailure({ text: copy.sale.notRegisteredNetwork, details: [] });
      } else {
        setFailure({ text: `${copy.sale.notRegistered} ${messageOf(error)}`, details: [] });
      }
    }
  }

  const header = (
    <header className="flex items-center gap-3">
      {step === 1 ? (
        <Link to="/" className="iconbtn" aria-label={copy.sale.exit}>
          <ChevronLeft className="ic" aria-hidden="true" />
        </Link>
      ) : (
        <button
          type="button"
          className="iconbtn"
          aria-label={copy.sale.backToProducts}
          onClick={() => setStep(1)}
        >
          <ChevronLeft className="ic" aria-hidden="true" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="h1" tabIndex={-1}>
          {copy.sale.newTitle}
        </h1>
        <div className="sub">{step === 1 ? copy.sale.step1 : copy.sale.step2}</div>
      </div>
    </header>
  );

  if (workday.isPending || !today || store.isPending) {
    return (
      <>
        {header}
        <LoadingRegion label={copy.states.loading}>
          <div className="glass2 overflow-hidden p-0">
            {[0, 1, 2, 3].map((n) => (
              <RowSkeleton key={n} />
            ))}
          </div>
        </LoadingRegion>
      </>
    );
  }
  if (workday.isError) {
    return (
      <>
        {header}
        <ErrorState error={workday.error} onRetry={() => void workday.refetch()} />
      </>
    );
  }
  if (!workday.data || offers.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon={ShoppingCart}
          title={copy.sale.dayNotPreparedTitle}
          text={copy.sale.dayNotPreparedText}
          action={
            <Link to="/dia" className="btn btn-p">
              {copy.sale.goPrepare}
            </Link>
          }
        />
      </>
    );
  }

  const failureBanner = failure ? (
    <Banner tone="bad">
      <p className="m-0">{failure.text}</p>
      {failure.details.length > 0 ? (
        <ul className="m-0 mt-1 pl-5">
          {failure.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      ) : null}
    </Banner>
  ) : null;

  if (step === 1) {
    const anySellable = offers.some(sellable);
    return (
      <>
        {header}
        {failureBanner}
        <SearchField
          label={copy.sale.search}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {!anySellable ? (
          <EmptyState
            icon={ShoppingCart}
            title={copy.sale.nothingToSellTitle}
            text={copy.sale.nothingToSellText}
          />
        ) : visible.length === 0 ? (
          <p className="sub">{copy.sale.noMatches}</p>
        ) : (
          <ul className="glass2 m-0 list-none overflow-hidden p-0">
            {visible.map((offer) => (
              <ProductRow
                key={offer.id}
                offer={offer}
                quantity={cart[offer.productId]}
                money={money}
                onStep={(direction) => change(stepQuantity(cart, offer, direction))}
                onCommit={(value) => change(setQuantity(cart, offer, value))}
              />
            ))}
          </ul>
        )}

        <div className="salebar glass2">
          <div className="min-w-0 flex-1">
            <div className="cap">
              {hasItems ? copy.sale.pieces(totals.pieces, totals.products) : copy.sale.emptyCart}
            </div>
            <div className="font-extrabold" style={{ fontSize: 28, letterSpacing: '-0.03em' }}>
              {money(totals.total)}
            </div>
          </div>
          <Button variant="primary" large disabled={!hasItems} onClick={() => setStep(2)}>
            {copy.sale.continue}
          </Button>
        </div>
        {guard.dialog}
      </>
    );
  }

  const received = collect === 'now' && check.ok ? check.paid : '0.00';
  const remaining = balanceOf(totals.total, received);

  return (
    <>
      {header}
      {failureBanner}
      {outside && workday.data ? (
        <Banner tone="warn">
          {copy.sale.outsideHours(workday.data.startTime, workday.data.endTime)}
        </Banner>
      ) : null}

      <section className="glass2 card flex flex-col gap-3" aria-label={copy.sale.products}>
        {lines.map((line) => (
          <div key={line.offer.id} className="flex items-baseline justify-between gap-3">
            <span>
              <b>{line.quantity} ×</b> {line.offer.productName}
            </span>
            <b>{money(line.subtotal)}</b>
          </div>
        ))}
        <hr style={{ border: 0, borderTop: '1px solid var(--hair)', width: '100%' }} />
        <div className="flex items-baseline justify-between gap-3">
          <span className="h2" style={{ fontSize: 16 }}>
            {copy.sale.total}
          </span>
          <span className="font-extrabold" style={{ fontSize: 28 }}>
            {money(totals.total)}
          </span>
        </div>
      </section>

      <div className="glass2 card flex flex-col gap-4">
        <Field
          label={copy.sale.customer}
          placeholder={copy.sale.customerPlaceholder}
          value={customer}
          maxLength={100}
          autoComplete="off"
          error={fieldErrors.customer}
          onChange={(event) => setCustomer(event.target.value)}
        />
        <Field
          label={copy.sale.note}
          placeholder={copy.sale.notePlaceholder}
          value={note}
          maxLength={500}
          autoComplete="off"
          error={fieldErrors.note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      <Segmented<Collect>
        label={copy.sale.collect}
        value={collect}
        options={[
          { value: 'now', label: copy.sale.payNow },
          { value: 'pending', label: copy.sale.leavePending },
        ]}
        onChange={setCollect}
      />

      <div className="glass2 card flex flex-col gap-3">
        {collect === 'pending' ? (
          <p className="sub m-0">{copy.sale.pendingInfo}</p>
        ) : (
          <>
            {check.ok
              ? check.lines.map((line) => (
                  <div key={line.method} className="flex items-baseline justify-between gap-3">
                    <span>{line.method === 'cash' ? copy.sale.cash : copy.sale.transfer}</span>
                    <b>{money(line.amount)}</b>
                  </div>
                ))
              : null}
            <div className="flex items-center justify-between gap-3">
              <span className="sub">
                {copy.sale.receivedLine(money(received))} · {copy.sale.missing}
              </span>
              <span className={`bdg ${remaining === '0.00' ? 'bdg-ok' : 'bdg-pen'}`}>
                {money(remaining)}
              </span>
            </div>
            <Button variant="ghost" disabled={!online} onClick={() => setEditingPayment(true)}>
              {copy.sale.changePayment}
            </Button>
          </>
        )}
      </div>

      <div className="salebar glass2">
        <Button
          variant="primary"
          large
          block
          loading={create.isPending}
          disabled={!online || (collect === 'now' && !check.ok)}
          onClick={() => void confirm()}
        >
          {copy.sale.confirm(money(totals.total))}
        </Button>
      </div>

      {editingPayment ? (
        <PaymentSheet
          title={copy.sale.collect}
          currency={currency}
          total={totals.total}
          received="0.00"
          balance={totals.total}
          initial={draft}
          confirmLabel={(amount) => `${copy.sale.apply} · ${amount}`}
          online={online}
          onClose={() => setEditingPayment(false)}
          onConfirm={(_lines, next) => {
            setPayment(next);
            setEditingPayment(false);
          }}
        />
      ) : null}
      {guard.dialog}
    </>
  );
}

function ProductRow({
  offer,
  quantity,
  money,
  onStep,
  onCommit,
}: {
  offer: DailyOffer;
  quantity: string | undefined;
  money: (amount: string) => string;
  onStep: (direction: 1 | -1) => void;
  onCommit: (value: string) => void;
}) {
  const canSell = sellable(offer);
  return (
    <li className="li">
      <div className="min-w-0 flex-1">
        <div className="h2 break-words" style={{ fontSize: 16 }}>
          {offer.productName}
        </div>
        <div className="cap">
          {money(offer.price)}
          {canSell ? ` · ${copy.sale.left(offer.availableQuantity)}` : ''}
        </div>
      </div>
      {!canSell ? (
        <span className="bdg bdg-can">
          {offer.productActive ? copy.sale.soldOut : copy.sale.inactive}
        </span>
      ) : quantity !== undefined ? (
        <QuantityStepper
          label={offer.productName}
          value={quantity}
          fractions={offer.allowsFractions}
          onStep={onStep}
          onCommit={onCommit}
        />
      ) : (
        <Button aria-label={`${copy.sale.add} ${offer.productName}`} onClick={() => onStep(1)}>
          {copy.sale.add}
        </Button>
      )}
    </li>
  );
}
