import { fromMilli, isWholeQuantity, quantitySchema, toMilli, type DailyOffer } from '@pos/shared';
import { useState, type FormEvent } from 'react';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { QuantityField } from '../../components/QuantityField';
import { Sheet } from '../../components/Sheet';
import { Stat } from '../../components/Stat';
import { copy } from '../../copy/es';
import { ApiError } from '../../lib/api';
import { messageOf } from '../../lib/errors';
import { dayQuantity } from './inventory';
import { useAdjustOffer } from './useWorkday';

/**
 * Aumenta la cantidad del día (M4, B9): solo sube, nunca baja, y exige un motivo. El servidor recibe
 * el aumento (nueva − actual) y vuelve a calcular todo.
 */
export function AdjustSheet({
  date,
  offer,
  online,
  onClose,
  onDone,
}: {
  date: string;
  offer: DailyOffer;
  online: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const current = dayQuantity(offer);
  const adjust = useAdjustOffer(date);
  const [quantity, setQuantity] = useState(current);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ quantity?: string; reason?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);

  const parsed = quantitySchema.safeParse(quantity);
  const increment =
    parsed.success && toMilli(parsed.data) > toMilli(current)
      ? fromMilli(toMilli(parsed.data) - toMilli(current))
      : null;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (adjust.isPending) return;
    setFailure(null);
    const found: typeof errors = {};
    if (!parsed.success) found.quantity = parsed.error.issues[0]?.message;
    else if (increment === null) found.quantity = copy.day.mustIncrease;
    else if (!offer.allowsFractions && !isWholeQuantity(parsed.data)) {
      found.quantity = 'Este producto se vende en piezas enteras.';
    }
    if (reason.trim() === '') found.reason = copy.day.reasonRequired;
    setErrors(found);
    if (found.quantity) return void document.getElementById('adjust-quantity')?.focus();
    if (found.reason || increment === null)
      return void document.getElementById('adjust-reason')?.focus();

    adjust.mutate(
      { offerId: offer.id, increment, reason: reason.trim() },
      {
        onSuccess: onDone,
        onError: (error) => {
          if (error instanceof ApiError && Object.keys(error.fields).length > 0) {
            setErrors({ quantity: error.fields.increment, reason: error.fields.reason });
          } else setFailure(messageOf(error));
        },
      },
    );
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => (!open && !adjust.isPending ? onClose() : undefined)}
      title={copy.day.adjustTitle}
      closeLabel={copy.day.close}
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {failure ? <Banner tone="bad">{failure}</Banner> : null}

        <div className="glass card flex flex-col gap-3">
          <b>{offer.productName}</b>
          <div className="grid grid-cols-3 gap-3">
            <Stat label={copy.day.initial} value={current} />
            <Stat label={copy.day.sold} value={offer.soldQuantity} />
            <Stat label={copy.day.available} value={offer.availableQuantity} />
          </div>
        </div>

        <QuantityField
          id="adjust-quantity"
          label={copy.day.newQuantity}
          value={quantity}
          onChange={(value) => {
            setQuantity(value);
            setErrors((e) => ({ ...e, quantity: undefined }));
          }}
          min={current}
          fractions={offer.allowsFractions}
          error={errors.quantity}
          hint={copy.day.adjustHint(current)}
        />

        <Field
          id="adjust-reason"
          label={`${copy.day.reason} *`}
          value={reason}
          maxLength={200}
          placeholder={copy.day.reasonPlaceholder}
          autoComplete="off"
          error={errors.reason}
          onChange={(event) => {
            setReason(event.target.value);
            setErrors((e) => ({ ...e, reason: undefined }));
          }}
        />

        <div className="flex flex-col gap-2">
          <Button
            type="submit"
            variant="primary"
            large
            block
            loading={adjust.isPending}
            disabled={!online}
          >
            {increment ? copy.day.saveIncrease(increment) : copy.day.increase}
          </Button>
          <Button variant="ghost" block disabled={adjust.isPending} onClick={onClose}>
            {copy.day.cancel}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
