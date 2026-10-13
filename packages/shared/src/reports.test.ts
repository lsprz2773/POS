import { describe, expect, it } from 'vitest';
import { listSalesQuerySchema, reportQuerySchema } from './index';

describe('reportQuerySchema', () => {
  it('acepta periodo, fecha o rango completo', () => {
    expect(reportQuerySchema.safeParse({}).success).toBe(true);
    expect(reportQuerySchema.safeParse({ period: 'week', date: '2026-10-15' }).success).toBe(true);
    expect(reportQuerySchema.safeParse({ from: '2026-10-01', to: '2026-10-05' }).success).toBe(
      true,
    );
  });

  it('rechaza rangos incompletos, mezclados, fechas y periodos inválidos', () => {
    for (const query of [
      { from: '2026-10-01' },
      { to: '2026-10-01' },
      { from: '2026-10-01', to: '2026-10-02', period: 'day' },
      { from: '2026-10-01', to: '2026-10-02', date: '2026-10-01' },
      { date: '2026-13-01' },
      { period: 'year' },
    ]) {
      expect(reportQuerySchema.safeParse(query).success, JSON.stringify(query)).toBe(false);
    }
  });
});

describe('listSalesQuerySchema', () => {
  it('usa valores por omisión y limpia la búsqueda vacía', () => {
    expect(listSalesQuerySchema.parse({})).toEqual({ limit: 50, offset: 0, q: undefined });
    expect(listSalesQuerySchema.parse({ q: '   ' }).q).toBeUndefined();
    expect(listSalesQuerySchema.parse({ q: ' Ana ' }).q).toBe('Ana');
  });

  it('acota la página y rechaza filtros inválidos', () => {
    for (const query of [
      { limit: '0' },
      { limit: '101' },
      { offset: '-1' },
      { status: 'otra' },
      { collection: 'cancelled' },
      { status: 'cancelled', collection: 'paid' },
      { q: 'x'.repeat(101) },
    ]) {
      expect(listSalesQuerySchema.safeParse(query).success, JSON.stringify(query)).toBe(false);
    }
  });
});
