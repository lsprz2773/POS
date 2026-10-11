import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const base = { AUTH_SECRET: 'x'.repeat(32) };

describe('loadConfig', () => {
  it('usa el puerto por omisión', () => {
    const config = loadConfig({ ...base, DATABASE_URL: 'postgres://u:p@h/db' });
    expect(config.PORT).toBe(3000);
  });

  it('convierte el puerto a número', () => {
    expect(loadConfig({ ...base, PORT: '8080', DATABASE_URL: 'x' }).PORT).toBe(8080);
  });

  it('falla si falta DATABASE_URL y nombra la variable', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it('no revela el valor de variables inválidas', () => {
    expect(() => loadConfig({ ...base, PORT: 'secreto-raro', DATABASE_URL: 'x' })).not.toThrow(
      /secreto/,
    );
    try {
      loadConfig({ ...base, PORT: 'secreto-raro', DATABASE_URL: 'x' });
    } catch (error) {
      expect(String(error)).not.toContain('secreto-raro');
    }
  });

  it('exige AUTH_SECRET con el proveedor local', () => {
    expect(() => loadConfig({ DATABASE_URL: 'x' })).toThrow(/AUTH_SECRET/);
    expect(() => loadConfig({ DATABASE_URL: 'x', AUTH_SECRET: 'corto' })).toThrow(/AUTH_SECRET/);
  });

  it('prohíbe el proveedor local en producción', () => {
    expect(() => loadConfig({ ...base, DATABASE_URL: 'x', NODE_ENV: 'production' })).toThrow(
      /AUTH_PROVIDER/,
    );
  });
});
