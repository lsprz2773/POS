import { createHash } from 'node:crypto';
import type { CreateSaleInput } from '@pos/shared';
import { toMilli } from '../workdays/workday.domain';

const CENTS = 100n;

/** Importe en centavos exactos: "25.50" -> 2550n. Evita el punto flotante (regla 16). */
export function toCents(value: string): bigint {
  const [whole = '0', fraction = ''] = value.trim().split('.');
  return BigInt(whole) * CENTS + BigInt(fraction.padEnd(2, '0').slice(0, 2));
}

export function fromCents(cents: bigint): string {
  const whole = cents / CENTS;
  const fraction = (cents % CENTS).toString().padStart(2, '0');
  return `${whole}.${fraction}`;
}

/**
 * Subtotal del renglón = cantidad × precio, redondeado a centavos con la mitad hacia arriba.
 * Con piezas enteras el resultado es exacto; el redondeo solo importa con cantidades fraccionarias.
 */
export function lineSubtotal(quantity: string, unitPrice: string): string {
  const thousandthsOfCents = toMilli(quantity) * toCents(unitPrice);
  return fromCents((thousandthsOfCents + 500n) / 1000n);
}

/** Total de la venta = suma de los subtotales de sus renglones (regla 17). */
export function sumMoney(values: string[]): string {
  return fromCents(values.reduce((total, value) => total + toCents(value), 0n));
}

/** Folio legible y consecutivo: V-0043 (RF-049). */
export const formatFolio = (folioNumber: number) => `V-${String(folioNumber).padStart(4, '0')}`;

/**
 * Huella del contenido de la venta, independiente del orden de los renglones. Con la misma llave de
 * idempotencia y la misma huella, un reintento devuelve la venta original; con otra, es un conflicto.
 */
export function hashSaleRequest(input: CreateSaleInput): string {
  const canonical = {
    items: input.items
      .map((item) => ({ productId: item.productId, quantity: item.quantity }))
      .sort((a, b) => a.productId.localeCompare(b.productId)),
    customerReference: input.customerReference ?? null,
    note: input.note ?? null,
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

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
