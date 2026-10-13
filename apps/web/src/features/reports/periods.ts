import { addDays, monthOf, toCents, weekOf, type Period } from '@pos/shared';
import { formatBusinessDate, formatMonthYear, formatShortDate } from '../../lib/format';

export type PeriodKind = 'day' | 'week' | 'month' | 'range';

/** El periodo de ese tipo que contiene la fecha. */
export function periodAround(kind: Exclude<PeriodKind, 'range'>, date: string): Period {
  if (kind === 'week') return weekOf(date);
  if (kind === 'month') return monthOf(date);
  return { from: date, to: date };
}

/**
 * Periodo del nuevo tipo al cambiar de tipo: si el que se ve contiene hoy, el nuevo también (Semana a Día
 * muestra hoy, no el lunes); si es otro periodo, se conserva su inicio como referencia.
 */
export function periodOnSwitch(
  kind: Exclude<PeriodKind, 'range'>,
  current: Period | null,
  today: string,
): Period {
  const containsToday = !current || (current.from <= today && today <= current.to);
  return periodAround(kind, containsToday ? today : current.from);
}

/** Periodo anterior (-1) o siguiente (+1) del mismo tipo, siempre completo. */
export function shiftPeriod(
  kind: Exclude<PeriodKind, 'range'>,
  period: Period,
  direction: 1 | -1,
): Period {
  const edge = direction === -1 ? addDays(period.from, -1) : addDays(period.to, 1);
  return periodAround(kind, edge);
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function periodLabel(kind: PeriodKind, period: Period): string {
  switch (kind) {
    case 'day':
      return capitalize(formatBusinessDate(period.from));
    case 'month':
      return capitalize(formatMonthYear(period.from));
    default:
      return `${formatShortDate(period.from)} a ${formatShortDate(period.to)}`;
  }
}

/** Porcentaje (entero) que `part` es de `total` (importes en texto); nulo si el total es cero. */
export function percentOf(part: string, total: string): number | null {
  const whole = toCents(total);
  if (whole <= 0n) return null;
  return Number((toCents(part) * 100n + whole / 2n) / whole);
}
