// Genera las capturas del manual de usuario (docs/manual-usuario.md). Un solo recorrido: se arma la tienda de
// ejemplo por API y cada pantalla se captura en el estado que describe el paso del manual.
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { owner, signIn } from '../e2e/helpers';
import { CATALOG, createProduct, offerToday, sell } from './seed';
import { shot } from './shot';

test('capturas del manual', async ({ page }) => {
  // 01 · Iniciar sesión
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(owner.email);
  await page.getByLabel('Contraseña').fill(randomUUID().slice(0, 12));
  await shot(page, '01-iniciar-sesion-formulario', {
    highlight: page.getByRole('button', { name: 'Iniciar sesión' }),
  });

  await signIn(page, owner);
  await expect(page.getByRole('heading', { name: 'Hoy' })).toBeVisible();

  // Datos de ejemplo: catálogo, día preparado y algunas ventas.
  const products = [];
  for (const item of CATALOG) {
    const product = await createProduct(page, item);
    await offerToday(page, product.id, item.quantity);
    products.push(product);
  }
  await sell(page, [{ productId: products[0]!.id, quantity: '3' }], {
    payments: [{ method: 'cash', amount: '75.00' }],
  });
  await sell(page, [{ productId: products[2]!.id, quantity: '2' }]);

  // 02 · Conocer la pantalla
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Hoy' })).toBeVisible();
  await expect(page.getByText('Falta por cobrar').first()).toBeVisible();
  await shot(page, '02-pantalla-hoy', {
    highlight: page.getByRole('link', { name: 'Nueva venta' }),
  });

  // 04 · Vender, paso 1
  await page.goto('/vender');
  await expect(page.getByText('Paso 1 de 2 · Productos')).toBeVisible();
  await shot(page, '04-vender-productos', {
    highlight: page.getByRole('searchbox', { name: 'Buscar producto' }),
  });
});
