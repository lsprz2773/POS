import { describe, expect, it } from 'vitest';
import { loginRequestSchema } from './index';

describe('loginRequestSchema', () => {
  it('normaliza el correo', () => {
    const result = loginRequestSchema.parse({ email: '  Dueno@Ejemplo.COM ', password: 'x' });
    expect(result.email).toBe('dueno@ejemplo.com');
  });

  it('rechaza correo inválido y contraseña vacía', () => {
    expect(loginRequestSchema.safeParse({ email: 'no-es-correo', password: 'x' }).success).toBe(
      false,
    );
    expect(loginRequestSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });
});
