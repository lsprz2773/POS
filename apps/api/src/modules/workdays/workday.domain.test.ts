import { describe, expect, it } from 'vitest';
import { addDays, isOperatingDay, isPastDate, isoWeekday, todayIn } from './workday.domain';

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
