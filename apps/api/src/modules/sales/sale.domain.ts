import { createHash } from 'node:crypto';
import type { CreateSaleInput, PaymentLinesInput } from '@pos/shared';
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
    // Solo si hay pagos: así las ventas sin pago conservan la misma huella que antes.
    ...(input.payments?.length ? { payments: canonicalLines(input.payments) } : {}),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

/** Huella de un pago sobre una venta: la misma llave con otro contenido es un conflicto. */
export function hashPaymentRequest(saleId: string, lines: PaymentLinesInput): string {
  const canonical = { saleId, lines: canonicalLines(lines) };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

const canonicalLines = (lines: PaymentLinesInput) =>
  lines
    .map((line) => ({ method: line.method, amount: line.amount }))
    .sort((a, b) => a.method.localeCompare(b.method));

export type CollectionStatus = 'pending' | 'partial' | 'paid' | 'cancelled';

/** Falta por pagar = total − pagado (regla 19). */
export function balanceOf(total: string, paid: string): string {
  return fromCents(toCents(total) - toCents(paid));
}

/**
 * Estado de cobro derivado de los pagos (RF-063 a RF-066, RF-071). Pagada solo cuando no falta nada;
 * una venta con saldo mayor que cero nunca es pagada.
 */
export function collectionStatus(sale: {
  status: 'active' | 'cancelled';
  total: string;
  paid: string;
}): CollectionStatus {
  if (sale.status === 'cancelled') return 'cancelled';
  const paid = toCents(sale.paid);
  if (paid >= toCents(sale.total)) return 'paid';
  return paid > 0n ? 'partial' : 'pending';
}

/** Importe con formato de moneda de la tienda, para mensajes: "$1,285.00". */
export function formatMoney(amount: string, currency: string): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(
    amount as unknown as number,
  );
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
