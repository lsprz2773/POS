import { storeSettingsSchema, type StoreSettings, type StoreSettingsUpdate } from '@pos/shared';
import { copy } from '../../copy/es';

export type SettingsErrors = Partial<Record<keyof StoreSettings, string>>;

/** Zonas horarias de México primero, con el nombre que se usa en el país. */
export const MEXICO_ZONES: readonly { id: string; label: string }[] = [
  { id: 'America/Mexico_City', label: 'Ciudad de México' },
  { id: 'America/Cancun', label: 'Cancún' },
  { id: 'America/Merida', label: 'Mérida' },
  { id: 'America/Monterrey', label: 'Monterrey' },
  { id: 'America/Chihuahua', label: 'Chihuahua' },
  { id: 'America/Ciudad_Juarez', label: 'Ciudad Juárez' },
  { id: 'America/Mazatlan', label: 'Mazatlán' },
  { id: 'America/Hermosillo', label: 'Hermosillo' },
  { id: 'America/Tijuana', label: 'Tijuana' },
];

export function otherZones(current: string): string[] {
  const known = new Set(MEXICO_ZONES.map((zone) => zone.id));
  const all =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  const rest = all.filter((zone) => !known.has(zone));
  // La zona guardada siempre aparece, aunque el navegador no la liste.
  if (!known.has(current) && !rest.includes(current)) rest.unshift(current);
  return rest;
}

export function validateSettings(
  values: StoreSettings,
): { ok: true; data: StoreSettings } | { ok: false; errors: SettingsErrors } {
  const result = storeSettingsSchema.safeParse(values);
  if (result.success) return { ok: true, data: result.data };
  const errors: SettingsErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof StoreSettings;
    errors[key] ??=
      key === 'operatingDays' && values.operatingDays.length === 0
        ? copy.settings.daysRequired
        : key === 'name'
          ? 'Escribe el nombre de la tienda.'
          : issue.message;
  }
  return { ok: false, errors };
}

/** Solo lo que cambió; el servidor valida además el resultado completo. */
export function settingsChanges(initial: StoreSettings, next: StoreSettings): StoreSettingsUpdate {
  const changes: Record<string, unknown> = {};
  for (const key of Object.keys(next) as (keyof StoreSettings)[]) {
    if (JSON.stringify(next[key]) !== JSON.stringify(initial[key])) changes[key] = next[key];
  }
  return changes as StoreSettingsUpdate;
}
