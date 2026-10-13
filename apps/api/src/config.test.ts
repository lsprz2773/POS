import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const base = { AUTH_SECRET: 'x'.repeat(32) };

describe('loadConfig', () => {
  it('usa el puerto por omisión', () => {
    const config = loadConfig({ ...base, DATABASE_URL: 'postgres://u@h/db' });
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

describe('loadConfig con Cognito y Parameter Store', () => {
  const cognito = {
    AUTH_PROVIDER: 'cognito',
    COGNITO_REGION: 'us-east-1',
    COGNITO_USER_POOL_ID: 'us-east-1_Prueba',
    COGNITO_CLIENT_ID: 'cliente',
  };

  it('acepta Cognito en producción con la base en Parameter Store', () => {
    const config = loadConfig({
      ...cognito,
      NODE_ENV: 'production',
      DATABASE_URL_PARAM: '/pos/prod/database-url',
    });
    expect(config.AUTH_PROVIDER).toBe('cognito');
    expect(config.DATABASE_URL).toBeUndefined();
  });

  it('con Cognito exige región, grupo de usuarios y cliente, y nombra lo que falta', () => {
    expect(() => loadConfig({ AUTH_PROVIDER: 'cognito', DATABASE_URL: 'x' })).toThrow(
      /COGNITO_REGION, COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID/,
    );
  });

  it('exige la base de datos directa o su parámetro', () => {
    expect(() => loadConfig({ ...cognito })).toThrow(/DATABASE_URL/);
  });

  it('el proveedor local sigue prohibido en producción', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'x', AUTH_SECRET: 'x'.repeat(32) }),
    ).toThrow(/AUTH_PROVIDER/);
  });
});
