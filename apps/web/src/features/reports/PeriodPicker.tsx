import { MAX_REPORT_DAYS } from '@pos/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { Segmented } from '../../components/Segmented';
import { copy } from '../../copy/es';
import { useToday } from '../store/useStore';
import { periodAround, periodLabel, periodOnSwitch, shiftPeriod, type PeriodKind } from './periods';

const KINDS = [
  { value: 'day', label: copy.reports.day },
  { value: 'week', label: copy.reports.week },
  { value: 'month', label: copy.reports.month },
  { value: 'range', label: copy.reports.range },
] as const;

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

export type PeriodRange = { from: string; to: string };

/**
 * Estado del selector de periodo de los reportes: día, semana, mes o rango, con navegación al periodo
 * anterior y siguiente. Lo usan el reporte general, el del equipo y el detalle de un vendedor.
 */
export function usePeriodControl(initial: PeriodKind = 'week') {
  const today = useToday();
  const [kind, setKind] = useState<PeriodKind>(initial);
  const [anchor, setAnchor] = useState<PeriodRange | null>(null);
  const [draft, setDraft] = useState({ from: '', to: '' });
  const [rangeError, setRangeError] = useState<string | null>(null);

  // Periodo mostrado: el elegido o, por omisión, el que contiene hoy.
  const period: PeriodRange | null =
    kind === 'range' ? anchor : (anchor ?? (today ? periodAround(kind, today) : null));

  function changeKind(next: PeriodKind) {
    setKind(next);
    setRangeError(null);
    if (next === 'range') {
      setAnchor(null);
      return;
    }
    setAnchor(today ? periodOnSwitch(next, period, today) : null);
  }

  function shift(direction: 1 | -1) {
    if (kind === 'range' || !period) return;
    setAnchor(shiftPeriod(kind, period, direction));
  }

  function applyRange(event: FormEvent) {
    event.preventDefault();
    if (!draft.from || !draft.to) {
      setRangeError(copy.reports.required);
    } else if (draft.to < draft.from) {
      setRangeError(copy.reports.invalidRange);
    } else if (daysBetween(draft.from, draft.to) > MAX_REPORT_DAYS) {
      setRangeError(copy.reports.tooLong);
    } else {
      setRangeError(null);
      setAnchor({ from: draft.from, to: draft.to });
    }
  }

  return {
    kind,
    period,
    /** Un rango sin elegir todavía no consulta nada. */
    waitingForRange: kind === 'range' && !anchor,
    isFuture: !!period && !!today && period.to >= today,
    draft,
    setDraft,
    rangeError,
    changeKind,
    shift,
    applyRange,
  };
}

export type PeriodControl = ReturnType<typeof usePeriodControl>;

export function PeriodPicker({ control }: { control: PeriodControl }) {
  const { kind, period, draft, setDraft, rangeError } = control;
  return (
    <>
      <Segmented<PeriodKind>
        label={copy.reports.period}
        value={kind}
        options={KINDS}
        onChange={control.changeKind}
      />

      {kind === 'range' ? (
        <form onSubmit={control.applyRange} noValidate className="glass2 card flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field
              id="report-from"
              type="date"
              label={copy.reports.from}
              value={draft.from}
              onChange={(event) => setDraft({ ...draft, from: event.target.value })}
            />
            <Field
              id="report-to"
              type="date"
              label={copy.reports.to}
              value={draft.to}
              error={rangeError ?? undefined}
              onChange={(event) => setDraft({ ...draft, to: event.target.value })}
            />
          </div>
          <Button type="submit" variant="primary">
            {copy.reports.apply}
          </Button>
        </form>
      ) : period ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="iconbtn"
            aria-label={copy.reports.previous}
            onClick={() => control.shift(-1)}
          >
            <ChevronLeft className="ic" aria-hidden="true" />
          </button>
          <div
            className="glass2 card flex-1 text-center font-bold"
            style={{ padding: '10px 12px' }}
            aria-live="polite"
          >
            {periodLabel(kind, period)}
          </div>
          <button
            type="button"
            className="iconbtn"
            aria-label={copy.reports.next}
            disabled={control.isFuture}
            onClick={() => control.shift(1)}
          >
            <ChevronRight className="ic" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </>
  );
}
