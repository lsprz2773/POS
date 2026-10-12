import { expect, test, type Page } from '@playwright/test';
import { expectAccessible, expectNoHorizontalScroll, owner, signIn, unique } from './helpers';

async function addProduct(
  page: Page,
  product: { name: string; price: string; cost: string; code?: string },
) {
  await page.goto('/catalogo/nuevo');
  await page.getByLabel('Nombre *').fill(product.name);
  await page.getByLabel('Precio de venta *').fill(product.price);
  await page.getByLabel('Costo *').fill(product.cost);
  if (product.code) await page.getByLabel('Código interno').fill(product.code);
  await page.getByRole('button', { name: 'Guardar producto' }).click();
}

test.beforeEach(async ({ page }) => {
  await signIn(page, owner);
  await expect(page.getByRole('heading', { name: 'Hoy' })).toBeVisible();
});

test('el propietario crea, busca, edita y desactiva un producto', async ({ page }, info) => {
  const name = unique('Tamal', info.project.name);
  const code = unique('T', info.project.name).replaceAll(' ', '-').toUpperCase();

  await addProduct(page, { name, price: '25', cost: '14', code });
  await expect(page.getByText('Producto guardado.').last()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Catálogo' })).toBeVisible();

  // Aparece en el catálogo con importes en pesos; la búsqueda por código lo encuentra.
  await page.getByRole('searchbox', { name: 'Buscar por nombre o código' }).fill(code);
  const row = page.getByRole('listitem').filter({ hasText: name });
  await expect(row).toBeVisible();
  await expect(row).toContainText('$25.00');
  await expect(row).toContainText('Costo $14.00');
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);

  // Editar el precio.
  await row.getByRole('link').first().click();
  await expect(page.getByRole('heading', { name: 'Editar producto' })).toBeVisible();
  await expectAccessible(page);
  await page.getByLabel('Precio de venta *').fill('30.5');
  await page.getByRole('button', { name: 'Guardar producto' }).click();
  await expect(page.getByText('Producto guardado.').last()).toBeVisible();
  await page.getByRole('searchbox', { name: 'Buscar por nombre o código' }).fill(code);
  await expect(page.getByRole('listitem').filter({ hasText: name })).toContainText('$30.50');

  // Desactivar: sale de "Activos" y aparece en "Inactivos".
  await page.getByRole('switch', { name: `Producto activo: ${name}` }).click();
  await expect(page.getByText(/Sus ventas anteriores se conservan/)).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: name })).toHaveCount(0);
  await page.getByRole('button', { name: 'Inactivos' }).click();
  const inactive = page.getByRole('listitem').filter({ hasText: name });
  await expect(inactive).toContainText('Inactivo');
  await expect(inactive.getByRole('switch')).not.toBeChecked();
});

test('un código repetido se marca en su campo y no se pierde lo escrito', async ({
  page,
}, info) => {
  const code = unique('D', info.project.name).replaceAll(' ', '-').toUpperCase();
  await addProduct(page, {
    name: unique('Primero', info.project.name),
    price: '10',
    cost: '5',
    code,
  });
  await expect(page.getByText('Producto guardado.').last()).toBeVisible();

  const second = unique('Segundo', info.project.name);
  await addProduct(page, { name: second, price: '12', cost: '6', code });
  await expect(page.getByLabel('Código interno')).toHaveAccessibleDescription(
    'Ya existe un producto con ese código.',
  );
  await expect(page.getByLabel('Nombre *')).toHaveValue(second);
  await expectAccessible(page);
});

test('los errores de un producto vacío son accesibles', async ({ page }) => {
  await page.goto('/catalogo/nuevo');
  await page.getByRole('button', { name: 'Guardar producto' }).click();
  await expect(page.getByLabel('Nombre *')).toBeFocused();
  await expect(page.getByLabel('Precio de venta *')).toHaveAccessibleDescription(
    /Escribe un importe/,
  );
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);
});

test('salir de un formulario con cambios pide confirmar, con foco en la salida segura', async ({
  page,
}) => {
  await page.goto('/catalogo/nuevo');
  await page.getByLabel('Nombre *').fill('Algo');
  await page.getByRole('button', { name: 'Cancelar' }).click();
  const dialog = page.getByRole('alertdialog', { name: '¿Salir sin guardar?' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Seguir editando' })).toBeFocused();
  await expectAccessible(page);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel('Nombre *')).toHaveValue('Algo');

  await page.getByRole('button', { name: 'Cancelar' }).click();
  await page.getByRole('button', { name: 'Descartar cambios' }).click();
  await expect(page.getByRole('heading', { name: 'Catálogo' })).toBeVisible();
});

test('la configuración de la tienda se guarda y sobrevive a recargar', async ({ page }) => {
  await page.goto('/configuracion');
  await expect(page.getByRole('heading', { name: 'Mi tienda' })).toBeVisible();
  await expect(page.getByLabel('Zona horaria')).toHaveValue('America/Mexico_City');
  await expect(page.getByLabel('Inicio de jornada')).toHaveValue('08:00');
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);

  // Se invierte el sábado respecto de lo que haya (las pruebas comparten base de datos).
  const saturday = page.getByRole('button', { name: 'sábado' });
  const before = await saturday.getAttribute('aria-pressed');
  await saturday.click();
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Cambios guardados.')).toBeVisible();

  await page.goto('/configuracion');
  const after = await page.getByRole('button', { name: 'sábado' }).getAttribute('aria-pressed');
  expect(after).not.toBe(before);
});

test('un horario inválido se explica en el campo y no se guarda', async ({ page }) => {
  await page.goto('/configuracion');
  await page.getByLabel('Fin de jornada').fill('07:00');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByLabel('Fin de jornada')).toHaveAccessibleDescription(
    'La hora de fin debe ser posterior a la de inicio.',
  );
  await expectAccessible(page);
});

test('desde Más se llega al catálogo y a la configuración', async ({ page }) => {
  await page.goto('/mas');
  await page.getByRole('link', { name: /Catálogo/ }).click();
  await expect(page.getByRole('heading', { name: 'Catálogo' })).toBeVisible();
  await page.getByRole('link', { name: 'Volver a Más' }).click();
  await page.getByRole('link', { name: /Configuración/ }).click();
  await expect(page.getByRole('heading', { name: 'Mi tienda' })).toBeVisible();
});
