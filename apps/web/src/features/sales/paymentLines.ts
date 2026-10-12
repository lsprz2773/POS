import {
  balanceOf,
  paymentLinesSchema,
  sumMoney,
  toCents,
  type PaymentLinesInput,
} from '@pos/shared';

export type PayMethod = 'cash' | 'transfer' | 'mixed';

export interface PaymentDraft {
  method: PayMethod;
  cash: string;
  transfer: string;
}

/** Punto de partida: todo lo que falta, en el método elegido (en mixto, todo en efectivo). */
export function draftFor(method: PayMethod, balance: string): PaymentDraft {
  return {
    method,
    cash: method === 'transfer' ? '' : balance,
    transfer: method === 'transfer' ? balance : '',
  };
}

export type PaymentCheck =
  | { ok: true; lines: PaymentLinesInput; paid: string; remaining: string }
  | { ok: false; errors: { cash?: string; transfer?: string; form?: string }; paid: string };

const amountsOf = (draft: PaymentDraft) => {
  const lines: { method: 'cash' | 'transfer'; amount: string }[] = [];
  if (draft.method !== 'transfer') lines.push({ method: 'cash', amount: draft.cash.trim() });
  if (draft.method !== 'cash') lines.push({ method: 'transfer', amount: draft.transfer.trim() });
  return lines;
};

/**
 * Valida con el esquema del servidor y con el saldo: ningún importe vacío o en cero, y nunca más de lo
 * que falta (B7). En mixto basta con que uno de los dos tenga importe.
 */
export function checkPayment(
  draft: PaymentDraft,
  balance: string,
  formatAmount: (amount: string) => string,
): PaymentCheck {
  let lines = amountsOf(draft);
  if (draft.method === 'mixed') lines = lines.filter((line) => line.amount !== '');

  const errors: { cash?: string; transfer?: string; form?: string } = {};
  const parsed = paymentLinesSchema.safeParse(lines);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const index = issue.path[0];
      const line = typeof index === 'number' ? lines[index] : undefined;
      if (line) errors[line.method] ??= line.amount === '' ? 'Escribe un importe.' : issue.message;
      else errors.form ??= 'Indica al menos un importe.';
    }
    return { ok: false, errors, paid: '0.00' };
  }

  const paid = sumMoney(parsed.data.map((line) => line.amount));
  if (toCents(paid) > toCents(balance)) {
    return {
      ok: false,
      errors: { form: `No puedes cobrar más de ${formatAmount(balance)}.` },
      paid,
    };
  }
  return { ok: true, lines: parsed.data, paid, remaining: balanceOf(balance, paid) };
}
