import { sql } from 'kysely';
import type { StoreSettings } from '@pos/shared';
import type { Database } from '../../db/client';

const toHHMM = (value: string) => value.slice(0, 5);

/**
 * Repositorio acotado a una tienda: el tenant se fija al construirlo y ningún método lo recibe,
 * de modo que no se puede consultar ni modificar otra tienda por error.
 */
export function createStoreRepository(db: Database, tenantId: string) {
  return {
    async get(options: { forUpdate?: boolean } = {}): Promise<StoreSettings> {
      let query = db
        .selectFrom('tenants')
        .innerJoin('store_settings', 'store_settings.tenant_id', 'tenants.id')
        .select([
          'tenants.name',
          'store_settings.currency',
          'store_settings.timezone',
          'store_settings.workday_start',
          'store_settings.workday_end',
          'store_settings.operating_days',
        ])
        .where('tenants.id', '=', tenantId);
      if (options.forUpdate) query = query.forUpdate();
      const row = await query.executeTakeFirstOrThrow();
      return {
        name: row.name,
        currency: row.currency as StoreSettings['currency'],
        timezone: row.timezone,
        workdayStart: toHHMM(row.workday_start),
        workdayEnd: toHHMM(row.workday_end),
        operatingDays: [...row.operating_days].sort((a, b) => a - b),
      };
    },

    async save(settings: StoreSettings): Promise<void> {
      await db
        .updateTable('tenants')
        .set({ name: settings.name })
        .where('id', '=', tenantId)
        .execute();
      await db
        .updateTable('store_settings')
        .set({
          currency: settings.currency,
          timezone: settings.timezone,
          workday_start: sql`${settings.workdayStart}::time`,
          workday_end: sql`${settings.workdayEnd}::time`,
          operating_days: sql`${settings.operatingDays}::smallint[]`,
        })
        .where('tenant_id', '=', tenantId)
        .execute();
    },
  };
}
