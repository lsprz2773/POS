import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('usa el puerto por omisión', () => {
    const config = loadConfig({ DATABASE_URL: 'postgres://u:p@h/db' });
    expect(config.PORT).toBe(3000);
  });

  it('convierte el puerto a número', () => {
    expect(loadConfig({ PORT: '8080', DATABASE_URL: 'x' }).PORT).toBe(8080);
  });

  it('falla si falta DATABASE_URL y nombra la variable', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it('no revela el valor de variables inválidas', () => {
    expect(() => loadConfig({ PORT: 'secreto-raro', DATABASE_URL: 'x' })).not.toThrow(/secreto/);
    try {
      loadConfig({ PORT: 'secreto-raro', DATABASE_URL: 'x' });
    } catch (error) {
      expect(String(error)).not.toContain('secreto-raro');
    }
  });
});
