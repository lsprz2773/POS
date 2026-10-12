import { formatMoney } from '@pos/shared';
import { useState, type FormEvent } from 'react';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { Segmented } from '../../components/Segmented';
import { Sheet } from '../../components/Sheet';
import { Stat } from '../../components/Stat';
import { copy } from '../../copy/es';
import { messageOf } from '../../lib/errors';
import { checkPayment, draftFor, type PayMethod, type PaymentDraft } from './paymentLines';
import type { PaymentLinesInput } from '@pos/shared';

const METHODS = [
  { value: 'cash', label: copy.sale.cash },
  { value: 'transfer', label: 'Transf.' },
  { value: 'mixed', label: copy.sale.mixed },
] as const;

interface Props {
  title: string;
  /** Línea pequeña bajo el título, por ejemplo "Venta V-0041". */
  subtitle?: string;
  currency: string;
  total: string;
  received: string;
  /** Lo que falta por pagar: el máximo que se puede cobrar. */
  balance: string;
  initial?: PaymentDraft;
  confirmLabel: (amount: string) => string;
  online: boolean;
  onClose: () => void;
  /** Recibe los renglones validados. Puede lanzar un ApiError para mostrarlo en la hoja. */
  onConfirm: (lines: PaymentLinesInput, draft: PaymentDraft) => Promise<void> | void;
}

/**
 * Hoja de cobro (M1): efectivo, transferencia o mixto, con validación en vivo contra lo que falta por
 * pagar. Sirve para cobrar al crear la venta y para registrar un pago después.
 */
export function PaymentSheet({
  title,
  subtitle,
  currency,
  total,
  received,
  balance,
  initial,
  confirmLabel,
  online,
  onClose,
  onConfirm,
}: Props) {
  const money = (amount: string) => formatMoney(amount, currency);
  const [draft, setDraft] = useState<PaymentDraft>(initial ?? draftFor('cash', balance));
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const check = checkPayment(draft, balance, money);
  const errors = touched && !check.ok ? check.errors : {};

  function choose(method: PayMethod) {
    setDraft(draftFor(method, balance));
    setTouched(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setFailure(null);
    setTouched(true);
    if (!check.ok) {
      const first = check.errors.cash ? 'pay-cash' : check.errors.transfer ? 'pay-transfer' : null;
      if (first) document.getElementById(first)?.focus();
      return;
    }
    setSaving(true);
    try {
      await onConfirm(check.lines, draft);
    } catch (error) {
      setFailure(messageOf(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => (!open && !saving ? onClose() : undefined)}
      title={title}
      description={subtitle}
      closeLabel="Cerrar"
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {failure ? <Banner tone="bad">{failure}</Banner> : null}

        <div className="grid grid-cols-3 gap-3">
          <Stat label={copy.sale.total} value={money(total)} />
          <Stat label={copy.sale.receivedTotal} value={money(received)} />
          <Stat label={copy.sale.missing} value={money(balance)} />
        </div>

        <Segmented<PayMethod>
          label={copy.sale.method}
          value={draft.method}
          options={METHODS}
          onChange={choose}
        />

        <div className={draft.method === 'mixed' ? 'grid grid-cols-2 gap-3' : ''}>
          {draft.method !== 'transfer' ? (
            <Field
              id="pay-cash"
              label={copy.sale.cash}
              inputMode="decimal"
              autoComplete="off"
              value={draft.cash}
              error={errors.cash}
              onChange={(event) => setDraft({ ...draft, cash: event.target.value })}
            />
          ) : null}
          {draft.method !== 'cash' ? (
            <Field
              id="pay-transfer"
              label={copy.sale.transfer}
              inputMode="decimal"
              autoComplete="off"
              value={draft.transfer}
              error={errors.transfer}
              onChange={(event) => setDraft({ ...draft, transfer: event.target.value })}
            />
          ) : null}
        </div>

        {errors.form ? <Banner tone="bad">{errors.form}</Banner> : null}
        {check.ok ? (
          <Banner tone={check.remaining === '0.00' ? 'ok' : 'info'}>
            {check.remaining === '0.00'
              ? copy.sale.sumOk(money(check.paid))
              : copy.sale.sumPartial(money(check.paid), money(check.remaining))}
          </Banner>
        ) : null}

        <div className="flex flex-col gap-2">
          <Button type="submit" variant="primary" large block loading={saving} disabled={!online}>
            {confirmLabel(money(check.paid))}
          </Button>
          <Button variant="ghost" block disabled={saving} onClick={onClose}>
            {copy.day.cancel}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
