import { describe, expect, it } from 'vitest';
import {
  addDays,
  availableQuantity,
  fromMilli,
  isOperatingDay,
  isPastDate,
  isoWeekday,
  isWholeQuantity,
  sumQuantities,
  todayIn,
  toMilli,
} from './workday.domain';

describe('cantidades exactas', () => {
  it('convierte a milésimas y de vuelta sin ceros sobrantes', () => {
    expect(toMilli('40')).toBe(40_000n);
    expect(toMilli('2.5')).toBe(2_500n);
    expect(toMilli('0.001')).toBe(1n);
    expect(fromMilli(40_000n)).toBe('40');
    expect(fromMilli(2_500n)).toBe('2.5');
    expect(fromMilli(1n)).toBe('0.001');
    expect(fromMilli(0n)).toBe('0');
  });

  it('suma decimales sin errores de redondeo', () => {
    expect(sumQuantities(['0.1', '0.2'])).toBe('0.3');
    expect(sumQuantities([])).toBe('0');
    expect(sumQuantities(['10', '5', '2.25'])).toBe('17.25');
  });

  it('calcula el disponible = inicial + aumentos − vendido', () => {
    expect(availableQuantity({ initial: '40', adjusted: '10', sold: '18' })).toBe('32');
    expect(availableQuantity({ initial: '2.5', adjusted: '0', sold: '0.5' })).toBe('2');
  });

  it('el disponible nunca es negativo', () => {
    expect(availableQuantity({ initial: '5', adjusted: '0', sold: '9' })).toBe('0');
  });

  it('distingue cantidades enteras de fraccionarias', () => {
    expect(isWholeQuantity('12')).toBe(true);
    expect(isWholeQuantity('12.000')).toBe(true);
    expect(isWholeQuantity('12.5')).toBe(false);
  });
});

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
