import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { expectAccessible, expectNoHorizontalScroll, owner, signIn, unique } from './helpers';

const ORIGIN = 'http://localhost:5183';

test.beforeEach(async ({ page }) => {
  await signIn(page, owner);
  await expect(page.getByRole('heading', { name: 'Hoy' })).toBeVisible();
});

/** Crea un producto activo directamente en el API (la sesión ya está iniciada en el navegador). */
async function createProduct(page: Page, name: string, price = '25') {
  const response = await page.request.post('/api/products', {
    headers: { origin: ORIGIN },
    data: { name, price, cost: '14' },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string; name: string };
}

async function addToDay(page: Page, name: string, quantity: string) {
  await page.getByRole('button', { name: 'Agregar producto' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Agregar producto' });
  await dialog.getByRole('searchbox').fill(name);
  await dialog.getByRole('button', { name: new RegExp(name) }).click();
  await dialog.getByLabel('Cantidad inicial', { exact: true }).fill(quantity);
  await dialog.getByRole('button', { name: 'Agregar al día' }).click();
  await expect(dialog).toBeHidden();
}

const card = (page: Page, name: string) => page.getByRole('listitem').filter({ hasText: name });

test('el propietario prepara el día, aumenta la cantidad, consulta el inventario y quita un producto', async ({
  page,
}, info) => {
  const name = unique('Gelatina', info.project.name);
  await createProduct(page, name);

  await page.goto('/dia');
  await expect(page.getByRole('heading', { name: 'Preparar día' })).toBeVisible();
  await expectAccessible(page);

  // Agregar al día.
  await page.getByRole('button', { name: 'Agregar producto' }).first().click();
  const addSheet = page.getByRole('dialog', { name: 'Agregar producto' });
  await addSheet.getByRole('searchbox').fill(name);
  await addSheet.getByRole('button', { name: new RegExp(name) }).click();
  await expectAccessible(page);
  await addSheet.getByLabel('Cantidad inicial', { exact: true }).fill('-2');
  await addSheet.getByRole('button', { name: 'Agregar al día' }).click();
  await expect(
    addSheet.getByLabel('Cantidad inicial', { exact: true }),
  ).toHaveAccessibleDescription(/No puede ser negativa/);
  await addSheet.getByLabel('Cantidad inicial', { exact: true }).fill('20');
  await addSheet.getByRole('button', { name: 'Agregar al día' }).click();
  await expect(page.getByText('Producto agregado al día.').last()).toBeVisible();

  const row = card(page, name);
  await expect(row).toContainText('20');
  await expect(row).toContainText('En el día');
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);

  // Aumentar con motivo.
  await row.getByRole('button', { name: /Aumentar/ }).click();
  const adjust = page.getByRole('dialog', { name: 'Aumentar cantidad' });
  await expect(adjust.getByLabel('Nueva cantidad', { exact: true })).toHaveValue('20');
  await adjust.getByLabel('Nueva cantidad', { exact: true }).fill('30');
  await adjust.getByLabel('Motivo *').fill('Se preparó más producto');
  await expectAccessible(page);
  await adjust.getByRole('button', { name: 'Guardar aumento · +10' }).click();
  await expect(page.getByText('Cantidad aumentada.').last()).toBeVisible();
  await expect(row.getByText('30', { exact: true }).first()).toBeVisible();

  // Inventario de solo consulta.
  await page.getByRole('link', { name: 'Inventario' }).click();
  await expect(page.getByRole('heading', { name: 'Inventario' })).toBeVisible();
  const inventoryRow = card(page, name);
  await expect(inventoryRow).toContainText('Disponible');
  await expect(inventoryRow).toContainText('Inicial 30');
  await expect(inventoryRow).toContainText('Quedan 30');
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);

  // Quitar un producto sin ventas, con confirmación.
  await page.getByRole('link', { name: 'Preparar', exact: true }).click();
  await card(page, name)
    .getByRole('button', { name: /Quitar/ })
    .click();
  const confirm = page.getByRole('alertdialog', { name: new RegExp('¿Quitar') });
  await expect(page.getByRole('button', { name: 'Volver' })).toBeFocused();
  await expectAccessible(page);
  await confirm.getByRole('button', { name: 'Quitar del día' }).click();
  await expect(page.getByText('Producto quitado del día.').last()).toBeVisible();
  await expect(card(page, name)).toHaveCount(0);
});

test('un producto con ventas no se puede quitar y se explica por qué', async ({ page }, info) => {
  const name = unique('Tamal', info.project.name);
  const product = await createProduct(page, name);
  await page.goto('/dia');
  await addToDay(page, name, '10');

  const sale = await page.request.post('/api/sales', {
    headers: { origin: ORIGIN, 'idempotency-key': randomUUID() },
    data: { items: [{ productId: product.id, quantity: '3' }] },
  });
  expect(sale.status()).toBe(201);

  await page.reload();
  const row = card(page, name);
  await expect(row).toContainText('Disponible');
  await expect(row).toContainText('7');
  await row.getByRole('button', { name: 'Con ventas: no se puede quitar.' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'No se puede quitar' });
  await expect(dialog).toContainText('ya tiene 3 vendidas');
  await expectAccessible(page);
  await dialog.getByRole('button', { name: 'Entendido' }).click();
  await expect(dialog).toBeHidden();
  await expect(card(page, name)).toHaveCount(1);

  // El inventario refleja la venta y la barra de avance.
  await page.goto('/dia/inventario');
  const inventory = card(page, name);
  await expect(inventory).toContainText('Vendido 3');
  await expect(inventory).toContainText('Quedan 7');
  await expect(inventory.getByRole('img', { name: '30 % vendido' })).toBeVisible();
});

test('las jornadas anteriores y los días futuros se manejan con claridad', async ({ page }) => {
  await page.goto('/dia/anteriores');
  await expect(page.getByRole('heading', { name: 'Jornadas anteriores' })).toBeVisible();
  await expect(page.getByText('Son días terminados: solo se pueden consultar.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Aún no hay jornadas anteriores' })).toBeVisible();
  await expectAccessible(page);

  // Un día lejano sin preparar invita a agregar productos; el campo de fecha tiene límites.
  await page.goto('/dia');
  const date = page.getByLabel('Fecha');
  await expect(date).toHaveAttribute('min', /^\d{4}-\d{2}-\d{2}$/);
  const max = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
  await date.fill(max);
  await expect(
    page.getByRole('heading', { name: 'Este día todavía no está preparado' }),
  ).toBeVisible();
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);
});

test('desde la barra de navegación se llega a Preparar día', async ({ page, isMobile }) => {
  const nav = page
    .getByRole('navigation', { name: 'Navegación principal' })
    .and(page.locator(isMobile ? '.tabbar' : '.side nav'));
  await nav.getByRole('link', { name: 'Día' }).click();
  await expect(page.getByRole('heading', { name: 'Preparar día' })).toBeVisible();
});
