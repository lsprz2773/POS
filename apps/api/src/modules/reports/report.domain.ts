import { AppError } from '../../errors';
import { addDays } from '../workdays/workday.domain';

/** Un reporte abarca como máximo un año para que la consulta siga siendo rápida. */
export const MAX_REPORT_DAYS = 366;

export interface Period {
  from: string;
  to: string;
}

const invalid = (field: string, message: string) =>
  new AppError(400, 'validation_error', 'Revisa los datos ingresados.', { [field]: message });

/** Lunes a domingo de la semana que contiene la fecha (B10). */
export function weekOf(date: string): Period {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
  const from = addDays(date, 1 - weekday);
  return { from, to: addDays(from, 6) };
}

export function monthOf(date: string): Period {
  const [year, month] = date.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prefix = date.slice(0, 7);
  return { from: `${prefix}-01`, to: `${prefix}-${String(last).padStart(2, '0')}` };
}

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
