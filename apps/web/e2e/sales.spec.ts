import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { expectAccessible, expectNoHorizontalScroll, owner, signIn, unique } from './helpers';

const ORIGIN = 'http://localhost:5183';

test.beforeEach(async ({ page }) => {
  await signIn(page, owner);
  await expect(page.getByRole('heading', { name: 'Hoy' })).toBeVisible();
});

/** Producto activo, ofrecido hoy con la cantidad dada. Devuelve su id y nombre únicos. */
async function stocked(page: Page, label: string, project: string, quantity: string, price = '25') {
  const name = unique(label, project);
  const created = await page.request.post('/api/products', {
    headers: { origin: ORIGIN },
    data: { name, price, cost: '14' },
  });
  expect(created.status()).toBe(201);
  const product = (await created.json()) as { id: string };
  const offer = await page.request.post('/api/workdays/today/offers', {
    headers: { origin: ORIGIN },
    data: { productId: product.id, quantity },
  });
  expect(offer.status()).toBe(201);
  return { id: product.id, name };
}

async function available(page: Page, productId: string) {
  const response = await page.request.get('/api/workdays/today');
  const day = (await response.json()) as {
    offers: { productId: string; availableQuantity: string }[];
  };
  return day.offers.find((offer) => offer.productId === productId)!.availableQuantity;
}

/** Arma una venta con `pieces` del producto y llega al paso 2. */
async function startSale(page: Page, name: string, pieces: number) {
  await page.goto('/vender');
  await page.getByRole('searchbox', { name: 'Buscar producto' }).fill(name);
  await page.getByRole('button', { name: `Agregar ${name}` }).click();
  for (let i = 1; i < pieces; i++) {
    await page.getByRole('button', { name: `Agregar una pieza de ${name}` }).click();
  }
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('Paso 2 de 2 · Cobro')).toBeVisible();
}

const folioOf = async (page: Page) =>
  (await page
    .getByText(/^V-\d{4,}$/)
    .first()
    .textContent())!.trim();

test('venta pagada en efectivo: de los productos al detalle, con el inventario descontado', async ({
  page,
}, info) => {
  const { id, name } = await stocked(page, 'Tamal', info.project.name, '10');

  await page.goto('/vender');
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Buscar producto' }).fill(name);
  await page.getByRole('button', { name: `Agregar ${name}` }).click();
  await page.getByRole('button', { name: `Agregar una pieza de ${name}` }).click();
  await expect(page.getByText('2 piezas · 1 producto')).toBeVisible();
  await expect(page.getByText('$50.00').first()).toBeVisible();
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);

  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('Paso 2 de 2 · Cobro')).toBeVisible();
  await expect(page.getByText(/Recibido \$50\.00/)).toBeVisible();
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);

  await page.getByRole('button', { name: 'Confirmar venta · $50.00' }).click();
  await expect(page.getByRole('heading', { name: 'Venta registrada' })).toBeVisible();
  await expect(page.getByText('Pagada')).toBeVisible();
  await expectAccessible(page);

  // El inventario ya se descontó.
  expect(await available(page, id)).toBe('8');

  await page.getByRole('link', { name: 'Ver detalle' }).click();
  await expect(page.getByRole('region', { name: 'Productos' })).toContainText(name);
  await expect(page.getByRole('region', { name: 'Totales' })).toContainText('$50.00');
  await expect(page.getByRole('region', { name: 'Historial de pagos' })).toContainText('Efectivo');
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);
});

test('venta con pago mixto parcial, cobro posterior y anulación de un pago', async ({
  page,
}, info) => {
  const { name } = await stocked(page, 'Jugo', info.project.name, '10', '20');
  await startSale(page, name, 3); // total $60.00

  // Cobro mixto parcial: $30 en efectivo y $10 por transferencia; faltan $20.
  await page.getByRole('button', { name: 'Cambiar método o importes' }).click();
  const sheet = page.getByRole('dialog', { name: 'Cobro' });
  await sheet.getByRole('button', { name: 'Mixto' }).click();
  await sheet.getByLabel('Efectivo').fill('30');
  await sheet.getByLabel('Transferencia').fill('10');
  await expect(sheet.getByText('Suma $40.00. Faltarán $20.00 por pagar.')).toBeVisible();
  await expectAccessible(page);
  await sheet.getByRole('button', { name: 'Usar este cobro · $40.00' }).click();
  await page.getByRole('button', { name: 'Confirmar venta · $60.00' }).click();

  await expect(page.getByRole('heading', { name: 'Venta registrada' })).toBeVisible();
  await expect(page.getByText('Pendiente', { exact: true })).toBeVisible();
  await expect(page.getByText('efectivo y transferencia', { exact: false })).toBeVisible();
  const folio = await folioOf(page);

  // Aparece en Pendientes con su saldo.
  await page.goto('/pendientes');
  const card = page.getByRole('listitem').filter({ hasText: folio });
  await expect(card).toContainText('$20.00');
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);

  // Cobrar el resto desde el detalle.
  await card.getByRole('link', { name: `Registrar pago ${folio}` }).click();
  await page.getByRole('button', { name: 'Registrar pago' }).click();
  const pay = page.getByRole('dialog', { name: 'Registrar pago' });
  await expect(pay.getByLabel('Efectivo')).toHaveValue('20.00');
  await pay.getByLabel('Efectivo').fill('25');
  await pay.getByRole('button', { name: /Registrar pago ·/ }).click();
  await expect(pay.getByText('No puedes cobrar más de $20.00.')).toBeVisible();
  await pay.getByLabel('Efectivo').fill('20');
  await pay.getByRole('button', { name: 'Registrar pago · $20.00' }).click();
  await expect(page.getByText('Pago registrado.').last()).toBeVisible();
  await expect(page.getByText('Pagada').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar pago' })).toHaveCount(0);

  // Ya no es pendiente.
  await page.goto('/pendientes');
  await expect(page.getByRole('listitem').filter({ hasText: folio })).toHaveCount(0);

  // Anular el pago por transferencia: la venta vuelve a tener saldo.
  await page.goBack();
  await page.getByRole('button', { name: /^Anular Transferencia/ }).click();
  const dialog = page.getByRole('alertdialog', { name: '¿Anular este pago?' });
  await expect(page.getByRole('button', { name: 'Volver' })).toBeFocused();
  await expectAccessible(page);
  await dialog.getByRole('button', { name: 'Anular pago' }).click();
  await expect(dialog.getByLabel('Motivo *')).toHaveAccessibleDescription(
    'Escribe el motivo de la anulación.',
  );
  await dialog.getByLabel('Motivo *').fill('Método equivocado');
  await dialog.getByRole('button', { name: 'Anular pago' }).click();
  await expect(page.getByText('Pago anulado.').last()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Historial de pagos' })).toContainText('Anulado');
  await expect(page.getByRole('region', { name: 'Totales' })).toContainText('$10.00');
  await expect(page.getByRole('button', { name: 'Registrar pago' })).toBeVisible();
});

test('dejar pendiente y filtrar los pendientes por fecha', async ({ page }, info) => {
  const { name } = await stocked(page, 'Gelatina', info.project.name, '10', '12');
  await startSale(page, name, 2);
  await page.getByRole('button', { name: 'Dejar pendiente' }).click();
  await expect(page.getByText(/La venta quedará pendiente por el total/)).toBeVisible();
  await page.getByRole('button', { name: /Confirmar venta/ }).click();
  await expect(page.getByRole('heading', { name: 'Venta registrada' })).toBeVisible();
  const folio = await folioOf(page);

  await page.goto('/pendientes');
  await expect(page.getByRole('listitem').filter({ hasText: folio })).toContainText('$24.00');

  await page.getByRole('button', { name: 'Todas las fechas' }).click();
  const filter = page.getByRole('dialog', { name: 'Filtrar por fecha de venta' });
  await expectAccessible(page);
  await filter.getByRole('button', { name: 'Ayer' }).click();
  await filter.getByRole('button', { name: 'Aplicar filtro' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: folio })).toHaveCount(0);
  await page
    .getByRole('button', { name: /oct|sep|nov|dic|ene|feb|mar|abr|may|jun|jul|ago/ })
    .first()
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Hoy' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Aplicar filtro' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: folio })).toBeVisible();
});

test('cancelar una venta con pagos: se conserva, devuelve el inventario y avisa del reembolso', async ({
  page,
}, info) => {
  const { id, name } = await stocked(page, 'Empanada', info.project.name, '10', '22');
  await startSale(page, name, 4); // $88.00 pagado en efectivo
  await page.getByRole('button', { name: /Confirmar venta/ }).click();
  await expect(page.getByRole('heading', { name: 'Venta registrada' })).toBeVisible();
  expect(await available(page, id)).toBe('6');

  await page.getByRole('link', { name: 'Ver detalle' }).click();
  await page.getByRole('button', { name: 'Cancelar venta' }).click();
  const dialog = page.getByRole('alertdialog', { name: /¿Cancelar la venta V-/ });
  await expect(page.getByRole('button', { name: 'Volver' })).toBeFocused();
  await expect(dialog).toContainText('Los $88.00 cobrados se conservan');
  await expectAccessible(page);
  await dialog.getByRole('button', { name: 'Cancelar venta' }).click();
  await expect(dialog.getByLabel('Motivo de la cancelación *')).toHaveAccessibleDescription(
    'Escribe el motivo para poder cancelar.',
  );
  await dialog.getByLabel('Motivo de la cancelación *').fill('Se registró dos veces');
  await dialog.getByRole('button', { name: 'Cancelar venta' }).click();

  await expect(page.getByText('Venta cancelada.').last()).toBeVisible();
  await expect(page.getByText('Por devolver fuera del sistema: $88.00')).toBeVisible();
  await expect(page.getByText('Las piezas volvieron al inventario.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar pago' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Anular/ })).toHaveCount(0);
  await expectAccessible(page);
  expect(await available(page, id)).toBe('10');
});

test('si el inventario cambia mientras se vende, no se registra y se explica', async ({
  page,
}, info) => {
  const { id, name } = await stocked(page, 'Sandwich', info.project.name, '5', '35');
  await startSale(page, name, 4);

  // Mientras tanto, otra venta se lleva casi todo (otra persona o pestaña).
  const other = await page.request.post('/api/sales', {
    headers: { origin: ORIGIN, 'idempotency-key': randomUUID() },
    data: { items: [{ productId: id, quantity: '4' }] },
  });
  expect(other.status()).toBe(201);

  await page.getByRole('button', { name: /Confirmar venta/ }).click();
  const alert = page.getByRole('alert').filter({ hasText: 'No se registró la venta.' });
  await expect(alert).toContainText(`Solo quedan 1 de ${name}.`);
  await expect(page.getByText('Paso 1 de 2 · Productos')).toBeVisible();
  await expectAccessible(page);
  expect(await available(page, id)).toBe('1');
});

test('sin conexión no se puede confirmar y al volver se habilita', async ({ page }, info) => {
  const { name } = await stocked(page, 'Atole', info.project.name, '10', '15');
  await startSale(page, name, 1);
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByText(/Sin conexión/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Confirmar venta/ })).toBeDisabled();
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByRole('button', { name: /Confirmar venta/ })).toBeEnabled();
});

test('Vender está al centro de la barra inferior y lleva a Nueva venta', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'La barra inferior es de móvil.');
  const links = page.locator('.tabbar a');
  await expect(links).toHaveCount(5);
  await expect(links.nth(2)).toHaveAccessibleName('Vender');
  await links.nth(2).click();
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible();
});
