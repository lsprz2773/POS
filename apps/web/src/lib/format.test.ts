import { describe, expect, it } from 'vitest';
import { formatBusinessDate, formatDateTime, formatShortDate } from './format';

describe('formato de fechas', () => {
  it('escribe la fecha de negocio en español sin depender de la zona del navegador', () => {
    expect(formatBusinessDate('2026-10-15')).toBe('jueves, 15 de octubre de 2026');
  });

  it('escribe fecha y hora en la zona horaria de la tienda', () => {
    expect(formatDateTime('2026-10-15T18:00:00Z', 'America/Mexico_City')).toMatch(
      /15.*oct.*2026.*12:00/,
    );
    expect(formatDateTime('2026-10-16T05:30:00Z', 'America/Mexico_City')).toMatch(/15.*23:30/);
  });
});

describe('fecha corta', () => {
  it('escribe día, mes abreviado y año', () => {
    expect(formatShortDate('2026-10-14')).toBe('14 oct 2026');
  });
});
