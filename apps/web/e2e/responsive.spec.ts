// Pasada responsiva y de accesibilidad (sección 10.4 de los requerimientos): las pantallas clave en un
// Android chico (320), un iPhone (390), una tableta (820) y escritorio (1280), en claro y en oscuro.
// Cada pantalla se revisa con axe (WCAG 2.2 AA) y sin desplazamiento horizontal.
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import {
  expectAccessible,
  expectNoHorizontalScroll,
  ORIGIN,
  owner,
  signIn,
  unique,
} from './helpers';

const SIZES = [
  { name: 'Android chico', width: 320, height: 640 },
  { name: 'iPhone', width: 390, height: 844 },
  // iPhone 13 Pro Max: donde se vieron los campos de fecha y hora desbordados.
  { name: 'iPhone Pro Max', width: 428, height: 926 },
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

/**
 * Los campos de fecha y hora (Preparar día, el filtro del Historial, Configuración y Reportes) deben quedar
 * dentro de su caja y sin encimarse con el campo de al lado. Safari de iOS los pintaba con un ancho propio;
 * aquí se revisa la geometría en el ancho del iPhone 13 Pro Max y en otros.
 */
async function expectFieldsInsideTheirBox(page: Page, where: string) {
  const problems = await page.evaluate(() => {
    const inputs = [
      ...document.querySelectorAll<HTMLInputElement>('input[type="date"], input[type="time"]'),
    ].filter((input) => input.offsetParent !== null);
    const found: string[] = [];
    const boxes = inputs.map((input) => ({
      id: input.id || input.type,
      rect: input.getBoundingClientRect(),
      parent: input
        .closest('.card, .sheet, form, section, fieldset, main')!
        .getBoundingClientRect(),
    }));
    for (const { id, rect, parent } of boxes) {
      if (rect.right > parent.right + 0.5) found.push(`${id} se sale por la derecha de su caja`);
      if (rect.left < parent.left - 0.5) found.push(`${id} se sale por la izquierda de su caja`);
      if (rect.right > window.innerWidth + 0.5) found.push(`${id} se sale de la pantalla`);
    }
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const one = boxes[a]!.rect;
        const two = boxes[b]!.rect;
        const sameRow = one.top < two.bottom && two.top < one.bottom;
        const overlap = one.left < two.right - 0.5 && two.left < one.right - 0.5;
        if (sameRow && overlap) found.push(`${boxes[a]!.id} y ${boxes[b]!.id} se encima`);
      }
    }
    return found;
  });
  expect(problems, where).toEqual([]);
}

for (const width of [320, 390, 428, 820]) {
  test(`los campos de fecha y hora quedan dentro de su caja a ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 926 });

    await page.goto('/dia');
    await expect(page.getByRole('heading', { name: 'Preparar día' })).toBeVisible();
    await expect(page.getByLabel('Fecha')).toBeVisible();
    await expectFieldsInsideTheirBox(page, 'Preparar día');

    await page.goto('/historial');
    await page.getByRole('button', { name: /Todas las fechas/ }).click();
    await expect(page.getByLabel('Desde')).toBeVisible();
    await expectFieldsInsideTheirBox(page, 'Filtro del historial');
    await page.keyboard.press('Escape');

    await page.goto('/configuracion');
    await expect(page.getByLabel('Inicio de jornada', { exact: true })).toBeVisible();
    await expectFieldsInsideTheirBox(page, 'Configuración');

    await page.goto('/reportes');
    await page.getByRole('button', { name: 'Rango' }).click();
    await expect(page.getByLabel('Desde')).toBeVisible();
    await expectFieldsInsideTheirBox(page, 'Reportes por rango');
  });
}

for (const size of SIZES) {
  test(`equipo y reportes del equipo a ${size.width} px (${size.name})`, async ({ page }, info) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    const name = unique('Responsivo', info.project.name);
    const email = `${name.toLowerCase().replace(/\s+/g, '-')}@e2e.test`;
    const response = await page.request.post('/api/team/sellers', {
      headers: { origin: ORIGIN },
      data: { displayName: name, email, password: 'Contrasena-Larga-1' },
    });
    expect(response.status()).toBe(201);
    const seller = (await response.json()) as { id: string };
    try {
      await page.goto('/equipo');
      await expect(page.getByRole('heading', { name: 'Equipo' })).toBeVisible();
      await expect(page.getByText(name)).toBeVisible();
      await check(page);

      await page
        .getByRole('button', { name: /Agregar vendedor/ })
        .first()
        .click();
      await expect(page.getByRole('dialog', { name: 'Agregar vendedor' })).toBeVisible();
      await check(page);
      await page.keyboard.press('Escape');

      await page.goto('/reportes/equipo');
      await expect(page.getByRole('heading', { name: 'Reportes por vendedor' })).toBeVisible();
      await expect(page.getByRole('link', { name: `Ver el detalle de ${name}` })).toBeVisible();
      await check(page);

      await page.goto(`/reportes/equipo/${seller.id}`);
      await expect(page.getByRole('heading', { name })).toBeVisible();
      await check(page);

      await page.goto('/mas');
      await check(page);
    } finally {
      await page.request.patch(`/api/team/${seller.id}`, {
        headers: { origin: ORIGIN },
        data: { status: 'disabled' },
      });
    }
  });
}
