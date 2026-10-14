import { AppError } from '../../errors';
import { addDays, MAX_REPORT_DAYS, monthOf, weekOf, type Period } from '@pos/shared';

const invalid = (field: string, message: string) =>
  new AppError(400, 'validation_error', 'Revisa los datos ingresados.', { [field]: message });

export function daysIn({ from, to }: Period): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

/** Rechaza rangos invertidos o demasiado largos (RF-084, fase 7). */
export function assertValidRange(period: Period, fields: { from: string; to: string }): void {
  if (period.to < period.from) {
    throw invalid(fields.to, 'La fecha final no puede ser anterior a la inicial.');
  }
  if (daysIn(period) > MAX_REPORT_DAYS) {
    throw invalid(fields.to, `El rango no puede pasar de ${MAX_REPORT_DAYS} días.`);
  }
}

export function resolvePeriod(
  query: { period?: 'day' | 'week' | 'month'; date?: string; from?: string; to?: string },
  today: string,
): Period {
  if (query.from !== undefined && query.to !== undefined) {
    const range = { from: query.from, to: query.to };
    assertValidRange(range, { from: 'from', to: 'to' });
    return range;
  }
  const date = query.date ?? today;
  switch (query.period ?? 'day') {
    case 'week':
      return weekOf(date);
    case 'month':
      return monthOf(date);
    default:
      return { from: date, to: date };
  }
}

/** Importe en centavos con signo: la utilidad bruta puede ser negativa (RF-100). */
export function formatSignedCents(cents: bigint): string {
  const sign = cents < 0n ? '-' : '';
  const abs = cents < 0n ? -cents : cents;
  return `${sign}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}

/** Ticket promedio en centavos, con la mitad hacia arriba. */
export function averageTicketCents(totalCents: bigint, count: number): bigint {
  if (count === 0) return 0n;
  const n = BigInt(count);
  return (totalCents * 2n + n) / (2n * n);
}

/** Margen bruto en porcentaje con 2 decimales; nulo si no hubo ventas (RF-099). */
export function grossMargin(profitCents: bigint, salesCents: bigint): string | null {
  if (salesCents <= 0n) return null;
  const abs = profitCents < 0n ? -profitCents : profitCents;
  const hundredths = (abs * 20000n + salesCents) / (2n * salesCents);
  return formatSignedCents(profitCents < 0n ? -hundredths : hundredths);
}

/**
 * El periodo inmediato anterior, para comparar: el mes anterior si el periodo es un mes, la semana anterior
 * si es una semana (lunes a domingo) y, en cualquier otro caso (un día o un rango), uno de la misma duración.
 */
export function previousPeriod(period: Period): Period {
  const before = addDays(period.from, -1);
  const month = monthOf(period.from);
  if (month.from === period.from && month.to === period.to) return monthOf(before);
  const week = weekOf(period.from);
  if (week.from === period.from && week.to === period.to) return weekOf(before);
  const days = daysIn(period);
  return { from: addDays(before, 1 - days), to: before };
}

/** Todas las fechas del periodo, de la primera a la última. */
export function datesIn(period: Period): string[] {
  const days = daysIn(period);
  return Array.from({ length: days }, (_, index) => addDays(period.from, index));
}
