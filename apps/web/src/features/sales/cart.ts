import {
  fromMilli,
  lineSubtotal,
  sumMoney,
  sumQuantities,
  toMilli,
  type DailyOffer,
} from '@pos/shared';

/** Borrador de la venta: producto → cantidad (texto decimal exacto). Lo que no está, no se vende. */
export type Cart = Readonly<Record<string, string>>;

export interface CartLine {
  offer: DailyOffer;
  quantity: string;
  subtotal: string;
}

/** Productos del día que se pueden vender: activos y con existencias. */
export const sellable = (offer: DailyOffer) =>
  offer.productActive && toMilli(offer.availableQuantity) > 0n;

/** Cambia la cantidad sin pasar de lo disponible; llegar a cero lo saca del borrador. */
export function setQuantity(cart: Cart, offer: DailyOffer, quantity: string): Cart {
  const wanted = toMilli(quantity);
  const limit = toMilli(offer.availableQuantity);
  const next = wanted > limit ? limit : wanted < 0n ? 0n : wanted;
  const rest = { ...cart };
  delete rest[offer.productId];
  return next === 0n ? rest : { ...rest, [offer.productId]: fromMilli(next) };
}

export const stepQuantity = (cart: Cart, offer: DailyOffer, direction: 1 | -1): Cart =>
  setQuantity(
    cart,
    offer,
    fromMilli(toMilli(cart[offer.productId] ?? '0') + BigInt(direction) * 1000n),
  );

export function cartLines(offers: readonly DailyOffer[], cart: Cart): CartLine[] {
  return offers
    .filter((offer) => cart[offer.productId] !== undefined)
    .map((offer) => ({
      offer,
      quantity: cart[offer.productId]!,
      subtotal: lineSubtotal(cart[offer.productId]!, offer.price),
    }));
}

/** Totales anticipados para la pantalla; el que cuenta es el que devuelve el servidor. */
export function cartTotals(lines: readonly CartLine[]) {
  return {
    total: sumMoney(lines.map((line) => line.subtotal)),
    pieces: sumQuantities(lines.map((line) => line.quantity)),
    products: lines.length,
  };
}
