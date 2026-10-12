import type { PaymentLinesInput } from '@pos/shared';
import { randomUUID } from 'node:crypto';
import type { Database } from '../../db/client';
import { AppError } from '../../errors';
import { recordAudit } from '../audit/audit';
import type { AuthContext } from '../tenancy/context';
import { balanceOf, formatFolio, formatMoney, sumMoney, toCents } from './sale.domain';
import { createSaleRepository } from './sale.repository';

export interface PaymentTarget {
  id: string;
  folioNumber: number;
  total: string;
}

/**
 * Registra los pagos de una operación sobre una venta que el llamador ya tiene bloqueada (o recién
 * creada) dentro de su transacción. Comprueba que no se cobre de más (B7), guarda los renglones,
 * marca la fecha de liquidación si ya no falta nada (RF-068) y audita, todo en la misma transacción.
 *
 * `field` es el campo del cuerpo al que se atribuye el error de importe.
 */
export async function applyPayments(
  trx: Database,
  ctx: AuthContext,
  params: {
    sale: PaymentTarget;
    lines: PaymentLinesInput;
    field: 'lines' | 'payments';
    currency: string;
    idempotencyKey: string;
    requestHash: string;
    now: Date;
  },
): Promise<void> {
  const { sale, lines } = params;
  const sales = createSaleRepository(trx, ctx.tenantId);

  const balance = balanceOf(sale.total, await sales.paidAmount(sale.id));
  const requested = sumMoney(lines.map((line) => line.amount));

  if (toCents(balance) === 0n) {
    throw new AppError(409, 'conflict', 'Esta venta no tiene saldo por cobrar.');
  }
  if (toCents(requested) > toCents(balance)) {
    const message = `No puedes cobrar más de ${formatMoney(balance, params.currency)}.`;
    throw new AppError(400, 'validation_error', 'Revisa los datos ingresados.', {
      [params.field]: message,
    });
  }

  const operationId = randomUUID();
  await sales.insertPayments({
    saleId: sale.id,
    lines,
    createdBy: ctx.userId,
    idempotencyKey: params.idempotencyKey,
    requestHash: params.requestHash,
    createdAt: params.now,
    operationId,
  });

  const balanceAfter = balanceOf(balance, requested);
  const settled = toCents(balanceAfter) === 0n;
  if (settled) await sales.setSettledAt(sale.id, params.now);

  await recordAudit(trx, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    entity: 'payment',
    entityId: operationId,
    action: 'create',
    data: {
      saleId: sale.id,
      folio: formatFolio(sale.folioNumber),
      lines: lines.map((line) => ({ method: line.method, amount: line.amount })),
      balanceAfter,
      settled,
    },
  });
}
