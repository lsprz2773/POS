const LOCALE = 'es-MX';

/** "jueves, 15 de octubre de 2026" a partir de una fecha de negocio AAAA-MM-DD. */
export function formatBusinessDate(date: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** "15 oct 2026, 12:00" en la zona horaria de la tienda. */
export function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(new Date(iso));
}

/** "14 oct 2026" a partir de una fecha de negocio AAAA-MM-DD. */
export function formatShortDate(date: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(new Date(`${date}T00:00:00Z`))
    .replace(/\./g, '');
}

/** "10:20" en la zona horaria de la tienda. */
export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(new Date(iso));
}

/** "octubre de 2026" a partir de una fecha de negocio. */
export function formatMonthYear(date: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}
