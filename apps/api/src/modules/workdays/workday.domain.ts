import { normalizeQuantity } from '@pos/shared';

/** Hasta cuántos días por delante se puede preparar una jornada (evita fechas con errores de captura). */
export const MAX_DAYS_AHEAD = 60;

const MILLI = 1000n;

/** Cantidad decimal exacta en milésimas: evita los errores de redondeo del punto flotante. */
export function toMilli(value: string): bigint {
  const [whole = '0', fraction = ''] = value.trim().split('.');
  return BigInt(whole) * MILLI + BigInt(fraction.padEnd(3, '0').slice(0, 3));
}

export function fromMilli(milli: bigint): string {
  const whole = milli / MILLI;
  const fraction = (milli % MILLI).toString().padStart(3, '0');
  return normalizeQuantity(`${whole}.${fraction}`);
}

export function sumQuantities(values: string[]): string {
  return fromMilli(values.reduce((total, value) => total + toMilli(value), 0n));
}

/** Disponible = inicial + aumentos − vendido (docs/dominio.md). Nunca negativo (invariante 2). */
export function availableQuantity(parts: {
  initial: string;
  adjusted: string;
  sold: string;
}): string {
  const available = toMilli(parts.initial) + toMilli(parts.adjusted) - toMilli(parts.sold);
  return fromMilli(available < 0n ? 0n : available);
}

export function isWholeQuantity(value: string): boolean {
  return toMilli(value) % MILLI === 0n;
}

/** Fecha de negocio (AAAA-MM-DD) de la tienda en el instante dado, según su zona horaria. */
export function todayIn(timezone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** 1 = lunes ... 7 = domingo, igual que `operating_days`. */
export function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export const isOperatingDay = (date: string, operatingDays: number[]) =>
  operatingDays.includes(isoWeekday(date));

export function addDays(date: string, days: number): string {
  const moment = new Date(`${date}T00:00:00Z`);
  moment.setUTCDate(moment.getUTCDate() + days);
  return moment.toISOString().slice(0, 10);
}

/** Las fechas AAAA-MM-DD se comparan como texto sin perder el orden. */
export const isPastDate = (date: string, today: string) => date < today;

export const toHHMM = (time: string) => time.slice(0, 5);
