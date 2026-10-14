import {
  addAdjustmentSchema,
  addDays,
  addOfferSchema,
  availableQuantity,
  isOperatingDay,
  isPastDate,
  isWholeQuantity,
  listWorkdaysQuerySchema,
  MAX_DAYS_AHEAD,
  sumQuantities,
  todayIn,
  updateWorkdayHoursSchema,
  viewDayQuerySchema,
  workdayDateParamSchema,
  type DailyOffer,
  type StoreSettings,
  type Workday,
  type WorkdayList,
} from '@pos/shared';
import { z } from 'zod';
import type { Database } from '../../db/client';
import { AppError } from '../../errors';
import { parseInput } from '../../validation';
import { recordAudit } from '../audit/audit';
import { createStoreRepository } from '../store/store.repository';
import type { AuthContext } from '../tenancy/context';
import { assertCan } from '../tenancy/permissions';
import { createWorkdayRepository, type WorkdayRow } from './workday.repository';

export type Clock = () => Date;

const DAY_NOT_PREPARED = 'Ese día todavía no está preparado.';
const OFFER_NOT_FOUND = 'Ese producto ya no está en el día.';
const PRODUCT_UNAVAILABLE = 'Ese producto no está disponible.';
const ALREADY_IN_DAY = 'Este producto ya está en el día. Súmale piezas con un aumento.';

const notFound = (message: string) => new AppError(404, 'not_found', message);

function parseId(id: string): string {
  const result = z.uuid().safeParse(id);
  if (!result.success) throw notFound(OFFER_NOT_FOUND);
  return result.data;
}

/** Resuelve `today` o una fecha AAAA-MM-DD contra el día de hoy de la tienda. */
function resolveDate(param: string, today: string): string {
  const parsed = parseInput(z.object({ date: workdayDateParamSchema }), { date: param });
  return parsed.date === 'today' ? today : parsed.date;
}

/** Una jornada pasada es de solo consulta; una muy lejana suele ser un error de captura. */
function assertEditable(date: string, today: string): void {
  if (isPastDate(date, today)) {
    throw new AppError(409, 'conflict', 'Esa jornada ya terminó: solo se puede consultar.');
  }
  if (date > addDays(today, MAX_DAYS_AHEAD)) {
    const message = `Solo puedes preparar hasta ${MAX_DAYS_AHEAD} días por adelantado.`;
    throw new AppError(400, 'validation_error', 'Revisa la fecha.', { date: message });
  }
}

async function loadView(
  repository: ReturnType<typeof createWorkdayRepository>,
  workday: WorkdayRow,
  settings: StoreSettings,
  today: string,
): Promise<Workday> {
  const offers = await repository.offersOf(workday.id);
  const ids = offers.map((offer) => offer.id);
  const [adjustments, sold] = await Promise.all([
    repository.adjustmentsOf(ids),
    repository.soldByOffer(ids),
  ]);

  const items: DailyOffer[] = offers.map((offer) => {
    const soldQuantity = sumQuantities([sold.get(offer.id) ?? '0']);
    const adjustedQuantity = sumQuantities([offer.adjustedQuantity]);
    const initialQuantity = sumQuantities([offer.initialQuantity]);
    return {
      id: offer.id,
      productId: offer.productId,
      productName: offer.productName,
      productCode: offer.productCode,
      productActive: offer.productActive,
      unit: offer.unit,
      allowsFractions: offer.allowsFractions,
      price: offer.price,
      initialQuantity,
      adjustedQuantity,
      soldQuantity,
      availableQuantity: availableQuantity({
        initial: initialQuantity,
        adjusted: adjustedQuantity,
        sold: soldQuantity,
      }),
      adjustments: adjustments
        .filter((adjustment) => adjustment.offerId === offer.id)
        .map(({ id, increment, reason, userEmail, createdAt }) => ({
          id,
          increment: sumQuantities([increment]),
          reason,
          userEmail,
          createdAt,
        })),
    };
  });

  return {
    id: workday.id,
    date: workday.date,
    startTime: workday.startTime,
    endTime: workday.endTime,
    isToday: workday.date === today,
    editable: !isPastDate(workday.date, today),
    isOperatingDay: isOperatingDay(workday.date, settings.operatingDays),
    offers: items,
  };
}

/** Contexto común: configuración de la tienda y el día de hoy en su zona horaria. */
async function context(db: Database, ctx: AuthContext, clock: Clock) {
  const settings = await createStoreRepository(db, ctx.tenantId).get();
  return { settings, today: todayIn(settings.timezone, clock()) };
}

/**
 * De quién es el día que se consulta. Cada persona ve el suyo; el propietario puede ver el de un vendedor
 * (`sellerId`), solo para consultar. Una persona ajena a la tienda responde como inexistente.
 */
async function dayOwnerFor(db: Database, ctx: AuthContext, sellerId: string | undefined) {
  if (!sellerId || sellerId === ctx.userId) return ctx.userId;
  assertCan(ctx, 'team:manage');
  const member = await db
    .selectFrom('memberships')
    .select('user_id')
    .where('tenant_id', '=', ctx.tenantId)
    .where('user_id', '=', sellerId)
    .executeTakeFirst();
  if (!member) throw notFound('Esa persona ya no está disponible.');
  return sellerId;
}

export async function getWorkday(
  db: Database,
  ctx: AuthContext,
  dateParam: string,
  query: unknown,
  clock: Clock,
): Promise<Workday> {
  assertCan(ctx, 'workday:read');
  const { sellerId } = parseInput(viewDayQuerySchema, query);
  const { settings, today } = await context(db, ctx, clock);
  const date = resolveDate(dateParam, today);
  const repository = createWorkdayRepository(
    db,
    ctx.tenantId,
    await dayOwnerFor(db, ctx, sellerId),
  );
  const workday = await repository.findByDate(date);
  if (!workday) throw notFound(DAY_NOT_PREPARED);
  return loadView(repository, workday, settings, today);
}

export async function listWorkdays(
  db: Database,
  ctx: AuthContext,
  query: unknown,
): Promise<WorkdayList> {
  assertCan(ctx, 'workday:read');
  const filter = parseInput(listWorkdaysQuerySchema, query);
  if (filter.from && filter.to && filter.to < filter.from) {
    throw new AppError(400, 'validation_error', 'Revisa el rango de fechas.', {
      to: 'La fecha final no puede ser anterior a la inicial.',
    });
  }
  const dayOwner = await dayOwnerFor(db, ctx, filter.sellerId);
  const { items, total } = await createWorkdayRepository(db, ctx.tenantId, dayOwner).list(filter);
  return {
    items: items.map((row) => ({
      id: row.id,
      date: row.date,
      startTime: row.startTime,
      endTime: row.endTime,
      products: row.products,
      initialQuantity: sumQuantities([row.initialQuantity]),
      adjustedQuantity: sumQuantities([row.adjustedQuantity]),
      soldQuantity: sumQuantities([row.soldQuantity]),
      availableQuantity: availableQuantity({
        initial: row.initialQuantity,
        adjusted: row.adjustedQuantity,
        sold: row.soldQuantity,
      }),
    })),
    total,
    limit: filter.limit,
    offset: filter.offset,
  };
}

/**
 * Agrega un producto activo a la jornada de la fecha. Si la jornada no existe, se crea con el
 * horario de la tienda (B8). Todo, con su auditoría, en una sola transacción.
 */
export async function addOffer(
  db: Database,
  ctx: AuthContext,
  dateParam: string,
  input: unknown,
  clock: Clock,
): Promise<Workday> {
  assertCan(ctx, 'workday:prepare');
  const data = parseInput(addOfferSchema, input);

  try {
    return await db.transaction().execute(async (trx) => {
      const { settings, today } = await context(trx, ctx, clock);
      const date = resolveDate(dateParam, today);
      assertEditable(date, today);
      const repository = createWorkdayRepository(trx, ctx.tenantId, ctx.userId);

      const product = await repository.findProduct(data.productId);
      if (!product) {
        throw new AppError(400, 'validation_error', 'Revisa los datos ingresados.', {
          productId: PRODUCT_UNAVAILABLE,
        });
      }
      if (!product.active) {
        throw new AppError(400, 'validation_error', 'Revisa los datos ingresados.', {
          productId: 'El producto está desactivado. Actívalo en el catálogo para agregarlo.',
        });
      }
      if (!product.allowsFractions && !isWholeQuantity(data.quantity)) {
        throw new AppError(400, 'validation_error', 'Revisa los datos ingresados.', {
          quantity: 'Este producto se vende en piezas enteras.',
        });
      }

      let workday = await repository.findByDate(date, { forUpdate: true });
      let created = false;
      if (!workday) {
        const inserted = await repository.insert(date, settings.workdayStart, settings.workdayEnd);
        created = inserted !== undefined;
        workday = inserted ?? (await repository.findByDate(date, { forUpdate: true }));
      }
      if (!workday) throw notFound(DAY_NOT_PREPARED);

      if (await repository.hasOfferForProduct(workday.id, product.id)) {
        throw new AppError(409, 'conflict', ALREADY_IN_DAY, { productId: ALREADY_IN_DAY });
      }

      const offerId = await repository.insertOffer(workday.id, product.id, data.quantity);

      if (created) {
        await recordAudit(trx, {
          tenantId: ctx.tenantId,
          actorUserId: ctx.userId,
          entity: 'workday',
          entityId: workday.id,
          action: 'create',
          data: { date, startTime: workday.startTime, endTime: workday.endTime },
        });
      }
      await recordAudit(trx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        entity: 'daily_offer',
        entityId: offerId,
        action: 'add',
        data: {
          date,
          productId: product.id,
          productName: product.name,
          initialQuantity: data.quantity,
        },
      });
      return loadView(repository, workday, settings, today);
    });
  } catch (error) {
    if (isUnique(error, 'daily_offers_workday_product_key')) {
      throw new AppError(409, 'conflict', ALREADY_IN_DAY, { productId: ALREADY_IN_DAY });
    }
    throw error;
  }
}

/** Quita un producto del día. Solo si no tiene ventas; la auditoría guarda lo que se quitó. */
export async function removeOffer(
  db: Database,
  ctx: AuthContext,
  dateParam: string,
  offerIdParam: string,
  clock: Clock,
): Promise<Workday> {
  assertCan(ctx, 'workday:prepare');
  const offerId = parseId(offerIdParam);

  return db.transaction().execute(async (trx) => {
    const { settings, today } = await context(trx, ctx, clock);
    const date = resolveDate(dateParam, today);
    const repository = createWorkdayRepository(trx, ctx.tenantId, ctx.userId);
    const workday = await repository.findByDate(date, { forUpdate: true });
    if (!workday) throw notFound(DAY_NOT_PREPARED);
    assertEditable(date, today);

    const offer = await repository.findOffer(workday.id, offerId, { forUpdate: true });
    if (!offer) throw notFound(OFFER_NOT_FOUND);

    if (await repository.hasSales(offer.id)) {
      throw new AppError(
        409,
        'conflict',
        'Este producto ya tiene ventas en el día y no se puede quitar.',
      );
    }

    await repository.deleteOffer(offer.id);
    await recordAudit(trx, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      entity: 'daily_offer',
      entityId: offer.id,
      action: 'remove',
      data: {
        date,
        productId: offer.productId,
        productName: offer.productName,
        initialQuantity: offer.initialQuantity,
        adjustedQuantity: offer.adjustedQuantity,
      },
    });
    return loadView(repository, workday, settings, today);
  });
}

/** Aumenta la cantidad inicial con motivo y responsable (B9, RF-038). Nunca la baja. */
export async function adjustOffer(
  db: Database,
  ctx: AuthContext,
  dateParam: string,
  offerIdParam: string,
  input: unknown,
  clock: Clock,
): Promise<Workday> {
  assertCan(ctx, 'workday:prepare');
  const offerId = parseId(offerIdParam);
  const data = parseInput(addAdjustmentSchema, input);

  return db.transaction().execute(async (trx) => {
    const { settings, today } = await context(trx, ctx, clock);
    const date = resolveDate(dateParam, today);
    const repository = createWorkdayRepository(trx, ctx.tenantId, ctx.userId);
    const workday = await repository.findByDate(date, { forUpdate: true });
    if (!workday) throw notFound(DAY_NOT_PREPARED);
    assertEditable(date, today);

    const offer = await repository.findOffer(workday.id, offerId, { forUpdate: true });
    if (!offer) throw notFound(OFFER_NOT_FOUND);
    if (!offer.allowsFractions && !isWholeQuantity(data.increment)) {
      throw new AppError(400, 'validation_error', 'Revisa los datos ingresados.', {
        increment: 'Este producto se vende en piezas enteras.',
      });
    }

    await repository.insertAdjustment(offer.id, data.increment, data.reason, ctx.userId);
    await recordAudit(trx, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      entity: 'daily_offer',
      entityId: offer.id,
      action: 'adjust',
      data: {
        date,
        productId: offer.productId,
        productName: offer.productName,
        increment: data.increment,
        reason: data.reason,
        adjustedBefore: sumQuantities([offer.adjustedQuantity]),
        adjustedAfter: sumQuantities([offer.adjustedQuantity, data.increment]),
      },
    });
    return loadView(repository, workday, settings, today);
  });
}

/** Ajusta el horario de una jornada concreta; el de la tienda no cambia (B15). */
export async function updateWorkdayHours(
  db: Database,
  ctx: AuthContext,
  dateParam: string,
  input: unknown,
  clock: Clock,
): Promise<Workday> {
  assertCan(ctx, 'workday:hours');
  const patch = parseInput(updateWorkdayHoursSchema, input);

  return db.transaction().execute(async (trx) => {
    const { settings, today } = await context(trx, ctx, clock);
    const date = resolveDate(dateParam, today);
    const repository = createWorkdayRepository(trx, ctx.tenantId, ctx.userId);
    const workday = await repository.findByDate(date, { forUpdate: true });
    if (!workday) throw notFound(DAY_NOT_PREPARED);
    assertEditable(date, today);

    const next = {
      startTime: patch.startTime ?? workday.startTime,
      endTime: patch.endTime ?? workday.endTime,
    };
    if (next.endTime <= next.startTime) {
      throw new AppError(400, 'validation_error', 'Revisa los datos ingresados.', {
        endTime: 'La hora de fin debe ser posterior a la de inicio.',
      });
    }
    if (next.startTime === workday.startTime && next.endTime === workday.endTime) {
      return loadView(repository, workday, settings, today);
    }

    await repository.updateHours(workday.id, next);
    await recordAudit(trx, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      entity: 'workday',
      entityId: workday.id,
      action: 'update_hours',
      data: {
        date,
        before: { startTime: workday.startTime, endTime: workday.endTime },
        after: next,
      },
    });
    return loadView(repository, { ...workday, ...next }, settings, today);
  });
}

function isUnique(error: unknown, constraint: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505' &&
    'constraint' in error &&
    error.constraint === constraint
  );
}
