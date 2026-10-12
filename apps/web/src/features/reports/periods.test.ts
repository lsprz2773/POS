import { describe, expect, it } from 'vitest';
import { percentOf, periodAround, periodLabel, shiftPeriod } from './periods';

describe('periodos de reporte', () => {
  it('el periodo que contiene una fecha', () => {
    expect(periodAround('day', '2026-10-15')).toEqual({ from: '2026-10-15', to: '2026-10-15' });
    expect(periodAround('week', '2026-10-15')).toEqual({ from: '2026-10-12', to: '2026-10-18' });
    expect(periodAround('month', '2026-10-15')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });

  it('el anterior y el siguiente son del mismo tipo y siempre completos', () => {
    const week = periodAround('week', '2026-10-15');
    expect(shiftPeriod('week', week, -1)).toEqual({ from: '2026-10-05', to: '2026-10-11' });
    expect(shiftPeriod('week', week, 1)).toEqual({ from: '2026-10-19', to: '2026-10-25' });
    const month = periodAround('month', '2026-03-10');
    expect(shiftPeriod('month', month, -1)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(shiftPeriod('month', month, 1)).toEqual({ from: '2026-04-01', to: '2026-04-30' });
    expect(shiftPeriod('day', periodAround('day', '2026-03-01'), -1)).toEqual({
      from: '2026-02-28',
      to: '2026-02-28',
    });
    expect(shiftPeriod('month', periodAround('month', '2026-01-10'), -1)).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
  });

  it('describe el periodo en español', () => {
    expect(periodLabel('day', { from: '2026-10-15', to: '2026-10-15' })).toBe(
      'Jueves, 15 de octubre de 2026',
    );
    expect(periodLabel('month', { from: '2026-10-01', to: '2026-10-31' })).toBe('Octubre de 2026');
    expect(periodLabel('week', { from: '2026-10-12', to: '2026-10-18' })).toBe(
      '12 oct 2026 a 18 oct 2026',
    );
  });

  it('el porcentaje usa importes exactos y no divide entre cero', () => {
    expect(percentOf('2980.00', '4592.00')).toBe(65);
    expect(percentOf('1612.00', '4592.00')).toBe(35);
    expect(percentOf('1.00', '3.00')).toBe(33);
    expect(percentOf('2.00', '3.00')).toBe(67);
    expect(percentOf('0.00', '0.00')).toBeNull();
  });
});
