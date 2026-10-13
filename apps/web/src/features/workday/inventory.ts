import { sumQuantities, toMilli } from '@pos/shared';

export type StockLevel = 'available' | 'low' | 'soldout';

interface Quantities {
  initialQuantity: string;
  adjustedQuantity: string;
  soldQuantity: string;
  availableQuantity: string;
}

/** Cantidad del día = inicial + aumentos (lo que se mostraba como "Inicial"). */
export const dayQuantity = (offer: Pick<Quantities, 'initialQuantity' | 'adjustedQuantity'>) =>
  sumQuantities([offer.initialQuantity, offer.adjustedQuantity]);

/** Agotado sin existencias; "pocas" cuando queda el 20 % o menos de lo que había. */
export function stockLevel(offer: Quantities): StockLevel {
  const available = toMilli(offer.availableQuantity);
  if (available === 0n) return 'soldout';
  const total = toMilli(dayQuantity(offer));
  return total > 0n && available * 5n <= total ? 'low' : 'available';
}

/** Porcentaje vendido (0 a 100) para la barra de avance; solo presentación. */
export function soldPercent(offer: Quantities): number {
  const total = toMilli(dayQuantity(offer));
  if (total === 0n) return 0;
  const percent = (toMilli(offer.soldQuantity) * 100n) / total;
  return Number(percent > 100n ? 100n : percent);
}
