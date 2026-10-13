import { normalizeQuantity } from './workdays';

/**
 * Aritmética exacta de dinero y cantidades, compartida por el backend (que decide) y el frontend
 * (que solo anticipa). Nunca usa `number`: importes en centavos y cantidades en milésimas (BigInt).
 */

const CENTS = 100n;
const MILLI = 1000n;

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

/** Importe con formato de moneda de la tienda: "$1,285.00". */
export function formatMoney(amount: string, currency: string): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(
    amount as unknown as number,
  );
}
