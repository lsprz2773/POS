import { describe, expect, it } from 'vitest';
import {
  addDays,
  isOperatingDay,
  isOutsideHours,
  isPastDate,
  isoWeekday,
  localTime,
  todayIn,
} from './dates';

describe('fechas de negocio', () => {
  it('calcula "hoy" en la zona horaria de la tienda, no en UTC', () => {
    // 05:30 UTC del 16 de octubre es 23:30 del 15 en la Ciudad de México (UTC-6).
    const now = new Date('2026-10-16T05:30:00Z');
    expect(todayIn('America/Mexico_City', now)).toBe('2026-10-15');
    expect(todayIn('UTC', now)).toBe('2026-10-16');
    expect(todayIn('Asia/Tokyo', now)).toBe('2026-10-16');
  });

  it('da el día de la semana de 1 (lunes) a 7 (domingo)', () => {
    expect(isoWeekday('2026-10-12')).toBe(1);
    expect(isoWeekday('2026-10-15')).toBe(4);
    expect(isoWeekday('2026-10-18')).toBe(7);
  });

  it('marca los días de operación configurados', () => {
    expect(isOperatingDay('2026-10-15', [1, 2, 3, 4, 5])).toBe(true);
    expect(isOperatingDay('2026-10-17', [1, 2, 3, 4, 5])).toBe(false);
    expect(isOperatingDay('2026-10-17', [1, 2, 3, 4, 5, 6])).toBe(true);
  });

  it('suma días cruzando mes y año', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('una fecha anterior a hoy es pasada', () => {
    expect(isPastDate('2026-10-14', '2026-10-15')).toBe(true);
    expect(isPastDate('2026-10-15', '2026-10-15')).toBe(false);
    expect(isPastDate('2026-10-16', '2026-10-15')).toBe(false);
  });
});

describe('horario de la jornada', () => {
  const hours = { startTime: '08:00', endTime: '16:00' };

  it('usa la hora local de la tienda', () => {
    expect(localTime('America/Mexico_City', new Date('2026-10-15T18:00:00Z'))).toBe('12:00');
    expect(localTime('UTC', new Date('2026-10-15T18:00:00Z'))).toBe('18:00');
  });

  it('avisa fuera de horario y no en el borde de apertura; el cierre ya es fuera', () => {
    const at = (utc: string) => new Date(`2026-10-15T${utc}:00Z`);
    expect(isOutsideHours('America/Mexico_City', at('14:00'), hours)).toBe(false); // 08:00
    expect(isOutsideHours('America/Mexico_City', at('13:59'), hours)).toBe(true); // 07:59
    expect(isOutsideHours('America/Mexico_City', at('21:59'), hours)).toBe(false); // 15:59
    expect(isOutsideHours('America/Mexico_City', at('22:00'), hours)).toBe(true); // 16:00
  });
});
