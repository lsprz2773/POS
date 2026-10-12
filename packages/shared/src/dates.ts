/** Fechas y horas de negocio de la tienda, compartidas por el backend y la web. */

/** Hasta cuántos días por delante se puede preparar una jornada (evita fechas con errores de captura). */
export const MAX_DAYS_AHEAD = 60;

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

/** Hora local de la tienda (HH:MM) en el instante dado. */
export function localTime(timezone: string, at: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
}

/** El horario de la jornada es informativo (B15): solo avisa, nunca bloquea. */
export function isOutsideHours(
  timezone: string,
  at: Date,
  hours: { startTime: string; endTime: string },
): boolean {
  const time = localTime(timezone, at);
  return time < hours.startTime || time >= hours.endTime;
}

export interface Period {
  from: string;
  to: string;
}

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
