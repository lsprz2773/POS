import { describe, expect, it } from 'vitest';
import { type StoreSettings } from '@pos/shared';
import { diffSettings } from './store.domain';

const base: StoreSettings = {
  name: 'Tienda',
  currency: 'MXN',
  timezone: 'America/Mexico_City',
  workdayStart: '08:00',
  workdayEnd: '16:00',
  operatingDays: [1, 2, 3, 4, 5],
};

describe('diffSettings', () => {
  it('no reporta cambios si todo es igual', () => {
    expect(diffSettings(base, { ...base })).toEqual({ before: {}, after: {} });
  });

  it('reporta solo los campos que cambiaron, con valor anterior y nuevo', () => {
    const next = { ...base, name: 'Otra', operatingDays: [1, 2, 3, 4, 5, 6] };
    expect(diffSettings(base, next)).toEqual({
      before: { name: 'Tienda', operatingDays: [1, 2, 3, 4, 5] },
      after: { name: 'Otra', operatingDays: [1, 2, 3, 4, 5, 6] },
    });
  });
});
