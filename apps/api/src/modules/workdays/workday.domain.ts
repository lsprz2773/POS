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
