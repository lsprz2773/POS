import { type StoreSettings } from '@pos/shared';

/** Campos que cambiaron entre dos versiones de la configuración, con su valor anterior y nuevo. */
export function diffSettings(
  before: StoreSettings,
  after: StoreSettings,
): { before: Partial<StoreSettings>; after: Partial<StoreSettings> } {
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};
  for (const key of Object.keys(after) as (keyof StoreSettings)[]) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changedBefore[key] = before[key];
      changedAfter[key] = after[key];
    }
  }
  return {
    before: changedBefore as Partial<StoreSettings>,
    after: changedAfter as Partial<StoreSettings>,
  };
}
