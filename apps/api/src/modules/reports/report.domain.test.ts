import { describe, expect, it } from 'vitest';
import {
  averageTicketCents,
  daysIn,
  formatSignedCents,
  grossMargin,
  resolvePeriod,
} from './report.domain';

describe('periodos', () => {
  it('resuelve día, semana, mes y rango; hoy por omisión', () => {
    const today = '2026-10-15';
    expect(resolvePeriod({}, today)).toEqual({ from: today, to: today });
    expect(resolvePeriod({ period: 'day', date: '2026-10-01' }, today)).toEqual({
      from: '2026-10-01',
      to: '2026-10-01',
    });
    expect(resolvePeriod({ period: 'week' }, today)).toEqual({
      from: '2026-10-12',
      to: '2026-10-18',
    });
    expect(resolvePeriod({ period: 'month', date: '2026-09-30' }, today)).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(resolvePeriod({ from: '2026-10-01', to: '2026-10-05' }, today)).toEqual({
      from: '2026-10-01',
      to: '2026-10-05',
    });
  });

  it('rechaza rangos invertidos o de más de 366 días', () => {
    expect(() => resolvePeriod({ from: '2026-10-05', to: '2026-10-01' }, '2026-10-15')).toThrow(
      expect.objectContaining({ fields: { to: expect.stringMatching(/anterior/) } }),
    );
    expect(daysIn({ from: '2026-01-01', to: '2026-12-31' })).toBe(365);
    expect(() => resolvePeriod({ from: '2026-01-01', to: '2027-01-02' }, '2026-10-15')).toThrow(
      expect.objectContaining({ fields: { to: expect.stringMatching(/366/) } }),
    );
    expect(resolvePeriod({ from: '2027-01-01', to: '2027-12-31' }, '2027-06-01').to).toBe(
      '2027-12-31',
    );
  });
});

describe('importes con signo', () => {
  it('formatea positivos, ceros y negativos', () => {
    expect(formatSignedCents(5605n)).toBe('56.05');
    expect(formatSignedCents(0n)).toBe('0.00');
    expect(formatSignedCents(-1000n)).toBe('-10.00');
    expect(formatSignedCents(-5n)).toBe('-0.05');
  });

  it('ticket promedio con la mitad hacia arriba', () => {
    expect(averageTicketCents(11100n, 2)).toBe(5550n);
    expect(averageTicketCents(10000n, 3)).toBe(3333n);
    expect(averageTicketCents(10001n, 2)).toBe(5001n); // 50.005 sube
    expect(averageTicketCents(0n, 0)).toBe(0n);
  });

  it('margen bruto en porcentaje con 2 decimales', () => {
    expect(grossMargin(5600n, 11100n)).toBe('50.45');
    expect(grossMargin(-1000n, 2000n)).toBe('-50.00');
    expect(grossMargin(2000n, 2000n)).toBe('100.00');
    expect(grossMargin(0n, 2000n)).toBe('0.00');
    expect(grossMargin(0n, 0n)).toBeNull();
  });
});
