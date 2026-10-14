import { describe, expect, it } from 'vitest';
import { createSellerSchema, sellerPasswordSchema, updateSellerSchema } from './team';

const valid = {
  displayName: ' Vera ',
  email: ' VERA@Tienda.test ',
  password: 'Contrasena-Larga-1',
};

describe('alta de vendedor', () => {
  it('normaliza el nombre y el correo', () => {
    expect(createSellerSchema.parse(valid)).toEqual({
      displayName: 'Vera',
      email: 'vera@tienda.test',
      password: 'Contrasena-Larga-1',
    });
  });

  it.each([
    ['corta', 'Abcdefgh1', 'Usa al menos 12'],
    ['sin mayúscula', 'contrasena-larga-1', 'mayúscula'],
    ['sin minúscula', 'CONTRASENA-LARGA-1', 'minúscula'],
    ['sin número', 'Contrasena-Larga', 'número'],
  ])('rechaza una contraseña %s', (_name, password, message) => {
    const result = sellerPasswordSchema.safeParse(password);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(message);
  });

  it('exige nombre, correo válido y un nombre de hasta 80 caracteres', () => {
    expect(createSellerSchema.safeParse({ ...valid, displayName: '   ' }).success).toBe(false);
    expect(createSellerSchema.safeParse({ ...valid, displayName: 'x'.repeat(81) }).success).toBe(
      false,
    );
    expect(createSellerSchema.safeParse({ ...valid, email: 'sin-arroba' }).success).toBe(false);
  });
});

describe('cambios de un vendedor', () => {
  it('acepta nombre, estado o ambos, pero no vacío ni estados raros', () => {
    expect(updateSellerSchema.safeParse({ displayName: 'Vera' }).success).toBe(true);
    expect(updateSellerSchema.safeParse({ status: 'disabled' }).success).toBe(true);
    expect(updateSellerSchema.safeParse({}).success).toBe(false);
    expect(updateSellerSchema.safeParse({ status: 'borrado' }).success).toBe(false);
  });
});
