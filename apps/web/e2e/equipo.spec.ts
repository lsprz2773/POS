// Equipo y vendedores (fase 10, flujos 16 a 21 de docs/plan.md). El propietario da de alta a sus vendedores
// por la interfaz; lo demás se arma por API y lo que cada flujo prueba se recorre en pantalla, en móvil y
// escritorio. Los vendedores creados se dan de baja al terminar cada prueba: el tope es de 10 activos.
import { randomUUID } from 'node:crypto';
import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';
import {
  expectAccessible,
  expectNoHorizontalScroll,
  ORIGIN,
  owner,
  signIn,
  unique,
} from './helpers';

const PASSWORD = 'Contrasena-Larga-1';

interface Seller {
  id: string;
  name: string;
  email: string;
}

/** Los vendedores que creó cada prueba, para darlos de baja al terminar. */
const created: Seller[] = [];

async function createSeller(page: Page, info: TestInfo, label = 'Vendedor'): Promise<Seller> {
  const name = unique(label, info.project.name);
  const email = `${name.toLowerCase().replace(/\s+/g, '-')}@e2e.test`;
  const response = await page.request.post('/api/team/sellers', {
    headers: { origin: ORIGIN },
    data: { displayName: name, email, password: PASSWORD },
  });
  expect(response.status(), await response.text()).toBe(201);
  const seller = { id: ((await response.json()) as { id: string }).id, name, email };
  created.push(seller);
  return seller;
}

/** Abre una sesión aparte (otro navegador) como el vendedor. */
async function sellerPage(browser: Browser, info: TestInfo, seller: Seller): Promise<Page> {
  const context = await browser.newContext({
    baseURL: info.project.use.baseURL,
    viewport: info.project.use.viewport,
    hasTouch: info.project.use.hasTouch,
    isMobile: info.project.use.isMobile,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await signIn(page, { email: seller.email, password: PASSWORD });
  await expect(page.getByRole('heading', { name: 'Hoy' })).toBeVisible();
  return page;
}

async function product(page: Page, label: string, project: string, price = '25') {
  const name = unique(label, project);
  const response = await page.request.post('/api/products', {
    headers: { origin: ORIGIN },
    data: { name, price, cost: '14' },
  });
  expect(response.status()).toBe(201);
  return { id: ((await response.json()) as { id: string }).id, name };
}

async function prepare(page: Page, productId: string, quantity = '20') {
  const response = await page.request.post('/api/workdays/today/offers', {
    headers: { origin: ORIGIN },
    data: { productId, quantity },
  });
  expect(response.status(), await response.text()).toBe(201);
}

async function sell(page: Page, productId: string, quantity: string, extra = {}) {
  const response = await page.request.post('/api/sales', {
    headers: { origin: ORIGIN, 'idempotency-key': randomUUID() },
    data: { items: [{ productId, quantity }], ...extra },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as { id: string; folio: string };
}

test.beforeEach(async ({ page }) => {
  created.length = 0;
  await signIn(page, owner);
  await expect(page.getByRole('heading', { name: 'Hoy' })).toBeVisible();
});

test.afterEach(async ({ page }) => {
  for (const seller of created) {
    await page.request.patch(`/api/team/${seller.id}`, {
      headers: { origin: ORIGIN },
      data: { status: 'disabled' },
    });
  }
});

test('Flujo 16: el propietario da de alta a un vendedor', async ({ page, browser }, info) => {
  const name = unique('Lucia', info.project.name);
  const email = `${name.toLowerCase().replace(/\s+/g, '-')}@e2e.test`;

  await page.goto('/mas');
  await page.getByRole('link', { name: 'Equipo' }).click();
  await expect(page.getByRole('heading', { name: 'Equipo' })).toBeVisible();
  await page
    .getByRole('button', { name: /Agregar vendedor/ })
    .first()
    .click();
  const sheet = page.getByRole('dialog', { name: 'Agregar vendedor' });
  await expectAccessible(page);
  await sheet.getByLabel('Nombre').fill(name);
  await sheet.getByLabel('Correo').fill(email);
  await sheet.getByLabel('Contraseña').fill(PASSWORD);
  await sheet.getByRole('button', { name: 'Crear vendedor' }).click();
  await expect(page.getByText(`${name} ya puede iniciar sesión.`).last()).toBeVisible();

  const row = page.getByRole('listitem').filter({ hasText: name });
  await expect(row).toContainText('Activo');
  await expect(row).toContainText(email);
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);

  // Con ese correo y esa contraseña inicia sesión, como vendedor.
  const created2 = await page.request.get('/api/team');
  const member = ((await created2.json()) as { items: Seller[] }).items.find(
    (item) => item.email === email,
  )!;
  created.push({ id: member.id, name, email });
  const seller = await sellerPage(browser, info, { id: member.id, name, email });
  await seller.goto('/perfil');
  await expect(seller.getByText('Vendedor', { exact: true })).toBeVisible();
  await seller.context().close();
});

test('Flujo 17: el vendedor prepara su día con productos del propietario y vende', async ({
  page,
  browser,
}, info) => {
  const item = await product(page, 'Tamal', info.project.name);
  const seller = await createSeller(page, info);
  const vera = await sellerPage(browser, info, seller);
  try {
    // Sin preparar su día no puede vender.
    await vera.goto('/dia');
    await vera.getByRole('button', { name: 'Agregar producto' }).first().click();
    const dialog = vera.getByRole('dialog', { name: 'Agregar producto' });
    await dialog.getByRole('searchbox').fill(item.name);
    await dialog.getByRole('button', { name: new RegExp(item.name) }).click();
    await dialog.getByLabel('Cantidad inicial', { exact: true }).fill('12');
    await dialog.getByRole('button', { name: 'Agregar al día' }).click();
    await expect(vera.getByText('Producto agregado al día.').last()).toBeVisible();
    await expectAccessible(vera);

    await vera.goto('/vender');
    await vera.getByRole('searchbox', { name: 'Buscar producto' }).fill(item.name);
    await vera.getByRole('button', { name: `Agregar ${item.name}` }).click();
    await vera.getByRole('button', { name: 'Agregar una pieza de ' + item.name }).click();
    await vera.getByRole('button', { name: 'Continuar' }).click();
    await expect(vera.getByText('Paso 2 de 2 · Cobro')).toBeVisible();
    await vera.getByRole('button', { name: 'Confirmar venta' }).click();
    await expect(vera.getByRole('heading', { name: 'Venta registrada' })).toBeVisible();

    // Su disponibilidad bajó; la del propietario (que no preparó este producto) no existe.
    const day = (await (await vera.request.get('/api/workdays/today')).json()) as {
      offers: { productName: string; soldQuantity: string; availableQuantity: string }[];
    };
    expect(day.offers.find((o) => o.productName === item.name)).toMatchObject({
      soldQuantity: '2',
      availableQuantity: '10',
    });
    const mine = (await (await page.request.get('/api/workdays/today')).json()) as {
      offers?: { productName: string }[];
    };
    expect(JSON.stringify(mine)).not.toContain(item.name);
  } finally {
    await vera.context().close();
  }
});

test('Flujo 18: el vendedor no crea productos y las direcciones prohibidas lo devuelven a Hoy', async ({
  page,
  browser,
}, info) => {
  const seller = await createSeller(page, info);
  const vera = await sellerPage(browser, info, seller);
  try {
    await vera.goto('/mas');
    const nav = vera.getByRole('navigation', { name: 'Más' });
    await expect(nav.getByRole('link', { name: 'Mis ventas' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Catálogo' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Configuración' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Equipo' })).toHaveCount(0);
    await expectAccessible(vera);

    for (const path of [
      '/catalogo',
      '/catalogo/nuevo',
      '/configuracion',
      '/equipo',
      '/reportes/equipo',
    ]) {
      await vera.goto(path);
      await expect(vera.getByRole('heading', { name: 'Hoy' })).toBeVisible();
      await expect(vera.getByText('No tienes acceso a esa pantalla.').last()).toBeVisible();
    }

    // El servidor lo rechaza aunque se salte la interfaz.
    const create = await vera.request.post('/api/products', {
      headers: { origin: ORIGIN },
      data: { name: 'Prohibido', price: '1', cost: '1' },
    });
    expect(create.status()).toBe(403);
    expect((await vera.request.get('/api/team')).status()).toBe(403);
    expect(
      (await vera.request.patch('/api/store', { headers: { origin: ORIGIN }, data: {} })).status(),
    ).toBe(403);
  } finally {
    await vera.context().close();
  }
});

test('Flujo 19: el vendedor no ve ventas ni inventario de otra persona', async ({
  page,
  browser,
}, info) => {
  const item = await product(page, 'Privado', info.project.name);
  await prepare(page, item.id);
  const ownerSale = await sell(page, item.id, '1', {
    customerReference: unique('Del propietario', info.project.name),
  });
  const seller = await createSeller(page, info);
  const vera = await sellerPage(browser, info, seller);
  try {
    await vera.goto('/historial');
    await expect(vera.getByRole('heading', { name: 'Mis ventas' })).toBeVisible();
    await expect(vera.getByText(ownerSale.folio)).toHaveCount(0);
    expect((await vera.request.get(`/api/sales/${ownerSale.id}`)).status()).toBe(404);
    // El día existe (lo preparó el propietario), pero ella no tiene nada preparado.
    const hers = (await (await vera.request.get('/api/workdays/today')).json()) as {
      offers: unknown[];
    };
    expect(hers.offers).toEqual([]);
    await vera.goto(`/ventas/${ownerSale.id}`);
    await expect(vera.getByText('Esta venta ya no está disponible')).toBeVisible();

    // El propietario sí consulta el día de su vendedor, solo para leer.
    await prepare(vera, item.id, '5');
    await page.goto(`/dia/inventario?vendedor=${seller.id}`);
    await expect(page.getByText(item.name)).toBeVisible();
    await expect(page.getByText(`Día de ${seller.name}`)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Preparar' })).toHaveCount(0);
    await expectAccessible(page);
  } finally {
    await vera.context().close();
  }
});

test('Flujo 20: reportes del equipo con lo que se debe a cada vendedor', async ({
  page,
  browser,
}, info) => {
  const item = await product(page, 'Reporte', info.project.name, '40');
  const seller = await createSeller(page, info, 'Ventas');
  const vera = await sellerPage(browser, info, seller);
  try {
    await prepare(vera, item.id, '10');
    const sale = await sell(vera, item.id, '3'); // $120 sin cobrar: se le debe todo
    expect(sale.folio).toMatch(/^V-/);

    await page.goto('/mas');
    await page.getByRole('link', { name: 'Reportes por vendedor' }).click();
    await expect(page.getByRole('heading', { name: 'Reportes por vendedor' })).toBeVisible();
    await page.getByRole('button', { name: 'Día' }).click();
    const card = page.getByRole('link', { name: `Ver el detalle de ${seller.name}` });
    await expect(card).toBeVisible();
    await expect(card).toContainText('$120.00');
    await expect(card).toContainText('Por cobrar');
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);

    // El detalle trae lo que se le debe con su antigüedad.
    await card.click();
    await expect(page.getByRole('heading', { name: seller.name })).toBeVisible();
    const owed = page.getByRole('region', { name: 'Lo que se le debe' });
    await expect(owed).toContainText('$120.00');
    await expect(owed).toContainText('Hasta 7 días');
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);

    // Pendientes: el desglose por vendedor y el filtro por persona.
    await page.goto('/pendientes');
    const bySeller = page.getByRole('region', { name: 'Por vendedor' });
    await expect(bySeller).toContainText(seller.name);
    await bySeller.getByRole('button', { name: `Ver los pendientes de ${seller.name}` }).click();
    await expect(page.getByRole('link', { name: sale.folio }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(`${seller.name} ·`) })).toBeVisible();
    await expectAccessible(page);

    // Hoy trae el bloque Por vendedor.
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Por vendedor' })).toContainText(seller.name);
  } finally {
    await vera.context().close();
  }
});

test('Flujo 21: la baja le corta el acceso al vendedor y se puede reactivar', async ({
  page,
  browser,
}, info) => {
  const seller = await createSeller(page, info);
  const vera = await sellerPage(browser, info, seller);
  try {
    await page.goto('/equipo');
    const row = page.getByRole('listitem').filter({ hasText: seller.name });
    await row.getByRole('button', { name: 'Dar de baja' }).click();
    const dialog = page.getByRole('alertdialog', { name: `¿Dar de baja a ${seller.name}?` });
    await expectAccessible(page);
    await dialog.getByRole('button', { name: 'Dar de baja' }).click();
    await expect(page.getByText(`${seller.name} ya no puede entrar.`).last()).toBeVisible();
    await expect(row).toContainText('Dado de baja');

    // Su sesión abierta ya no sirve: en su siguiente pantalla ve que su cuenta fue dada de baja.
    await vera.goto('/historial');
    await expect(vera.getByRole('heading', { name: 'Tu cuenta fue dada de baja' })).toBeVisible();
    await expectAccessible(vera);
    expect((await vera.request.get('/api/sales')).status()).toBe(403);
    // Y no puede volver a entrar.
    await vera.context().clearCookies();
    await signIn(vera, { email: seller.email, password: PASSWORD });
    await expect(vera.getByText('Correo o contraseña incorrectos.')).toBeVisible();

    // Al reactivarlo vuelve a entrar.
    await row.getByRole('button', { name: 'Reactivar' }).click();
    await expect(row).toContainText('Activo');
    await signIn(vera, { email: seller.email, password: PASSWORD });
    await expect(vera.getByRole('heading', { name: 'Hoy' })).toBeVisible();
  } finally {
    await vera.context().close();
  }
});
