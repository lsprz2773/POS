import { addDays, monthOf, weekOf } from '@pos/shared';
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { Sheet } from '../../components/Sheet';
import { copy } from '../../copy/es';

/** Filtro por rango de fechas (M8): atajos y fechas exactas. Sin filtro = todas las fechas. */
export function DateRangeSheet({
  today,
  value,
  onApply,
  onClose,
}: {
  today: string;
  value: { from?: string; to?: string };
  onApply: (range: { from?: string; to?: string }) => void;
  onClose: () => void;
}) {
  const [from, setFrom] = useState(value.from ?? '');
  const [to, setTo] = useState(value.to ?? '');
  const [error, setError] = useState<string | null>(null);

  const shortcuts = [
    { label: copy.sale.shortcutToday, range: { from: today, to: today } },
    {
      label: copy.sale.shortcutYesterday,
      range: { from: addDays(today, -1), to: addDays(today, -1) },
    },
    { label: copy.sale.shortcutWeek, range: weekOf(today) },
    { label: copy.sale.shortcutMonth, range: monthOf(today) },
  ];

  function submit(event: FormEvent) {
    event.preventDefault();
    if (from && to && to < from) {
      setError(copy.sale.rangeInvalid);
      document.getElementById('range-to')?.focus();
      return;
    }
    onApply({ ...(from ? { from } : {}), ...(to ? { to } : {}) });
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => (!open ? onClose() : undefined)}
      title={copy.sale.filterTitle}
      closeLabel={copy.day.close}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {shortcuts.map(({ label, range }) => (
            <button
              key={label}
              type="button"
              className="pill"
              aria-pressed={from === range.from && to === range.to}
              onClick={() => {
                setFrom(range.from);
                setTo(range.to);
                setError(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            id="range-from"
            type="date"
            label={copy.sale.from}
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setError(null);
            }}
          />
          <Field
            id="range-to"
            type="date"
            label={copy.sale.to}
            value={to}
            error={error ?? undefined}
            onChange={(event) => {
              setTo(event.target.value);
              setError(null);
            }}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Button type="submit" variant="primary" large block>
            {copy.sale.apply2}
          </Button>
          <Button variant="ghost" block onClick={() => onApply({})}>
            {copy.sale.clear}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
