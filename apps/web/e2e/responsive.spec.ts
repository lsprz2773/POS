// Pasada responsiva y de accesibilidad (sección 10.4 de los requerimientos): las pantallas clave en un
// Android chico (320), un iPhone (390), una tableta (820) y escritorio (1280), en claro y en oscuro.
// Cada pantalla se revisa con axe (WCAG 2.2 AA) y sin desplazamiento horizontal.
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { expectAccessible, expectNoHorizontalScroll, owner, signIn, unique } from './helpers';

const ORIGIN = 'http://localhost:5183';

const SIZES = [
  { name: 'Android chico', width: 320, height: 640 },
  { name: 'iPhone', width: 390, height: 844 },
  { name: 'tableta', width: 820, height: 1180 },
  { name: 'escritorio', width: 1280, height: 800 },
] as const;

// El tamaño lo fija cada prueba: basta con correrlas en un solo proyecto.
test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'escritorio', 'Recorre todos los tamaños en una sola pasada.');
  await signIn(page, owner);
  await expect(page.getByRole('heading', { name: 'Hoy' })).toBeVisible();
});

async function seed(page: Page, project: string) {
  const name = unique('Responsivo', project);
  const created = await page.request.post('/api/products', {
    headers: { origin: ORIGIN },
    data: { name, price: '25', cost: '14' },
  });
  const product = (await created.json()) as { id: string };
  await page.request.post('/api/workdays/today/offers', {
    headers: { origin: ORIGIN },
    data: { productId: product.id, quantity: '30' },
  });
  const sale = await page.request.post('/api/sales', {
    headers: { origin: ORIGIN, 'idempotency-key': randomUUID() },
    data: { items: [{ productId: product.id, quantity: '2' }], customerReference: 'Responsivo' },
  });
  return { name, saleId: ((await sale.json()) as { id: string }).id };
}

const check = async (page: Page) => {
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);
};

for (const scheme of ['light', 'dark'] as const) {
  for (const size of SIZES) {
    test(`pantallas principales a ${size.width} px (${size.name}, ${scheme})`, async ({
      page,
    }, info) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: size.width, height: size.height });
      const { name, saleId } = await seed(page, info.project.name);

      // Navegación: Hoy, Pendientes, Día, Más.
      for (const path of ['/', '/pendientes', '/dia', '/dia/inventario', '/mas', '/historial']) {
        await page.goto(path);
        await expect(page.getByRole('main')).toBeVisible();
        await check(page);
      }

      // Nueva venta: productos y cobro.
      await page.goto('/vender');
      await page.getByRole('searchbox', { name: 'Buscar producto' }).fill(name);
      await page.getByRole('button', { name: `Agregar ${name}` }).click();
      await check(page);
      await page.getByRole('button', { name: 'Continuar' }).click();
      await expect(page.getByText('Paso 2 de 2 · Cobro')).toBeVisible();
      await check(page);

      // Hoja de cobro mixto.
      await page.getByRole('button', { name: 'Cambiar método o importes' }).click();
      const sheet = page.getByRole('dialog', { name: 'Cobro' });
      await sheet.getByRole('button', { name: 'Mixto' }).click();
      await sheet.getByLabel('Efectivo').fill('10');
      await sheet.getByLabel('Transferencia').fill('5');
      await check(page);
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();

      // Reportes, formularios y detalle con su modal de alto impacto.
      await page.goto('/reportes');
      await expect(page.getByRole('heading', { name: 'Reportes' })).toBeVisible();
      await check(page);
      for (const path of ['/catalogo', '/catalogo/nuevo', '/configuracion']) {
        await page.goto(path);
        await expect(page.getByRole('main')).toBeVisible();
        await check(page);
      }
      await page.goto(`/ventas/${saleId}`);
      await page.getByRole('button', { name: 'Cancelar venta' }).click();
      await expect(page.getByRole('alertdialog')).toBeVisible();
      await check(page);
    });
  }
}
