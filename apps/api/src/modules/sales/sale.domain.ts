import { createHash } from 'node:crypto';
import type { CreateSaleInput, PaymentLinesInput } from '@pos/shared';

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
