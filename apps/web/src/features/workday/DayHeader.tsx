import { formatBusinessDate } from '../../lib/format';

/** "jueves, 15 de octubre de 2026" con la primera letra en mayúscula. */
export function dayTitle(date: string): string {
  const text = formatBusinessDate(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}
