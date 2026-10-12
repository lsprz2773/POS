// Los 15 flujos mínimos de extremo a extremo (docs/requerimientos.md, sección 10.4). Cada prueba se
// llama "Flujo N: …" para poder trazarla desde docs/plan.md. Los datos de apoyo se crean por API y lo
// que el flujo prueba se recorre en la interfaz.
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import {
  expectAccessible,
  expectNoHorizontalScroll,
  other,
  owner,
  signIn,
  unique,
} from './helpers';

const ORIGIN = 'http://localhost:5183';
const peso = (amount: string) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(amount));

/** Producto activo ofrecido hoy (API). */
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
  const day = (await (await page.request.get('/api/workdays/today')).json()) as {
    offers: { productId: string; availableQuantity: string }[];
  };
  return day.offers.find((offer) => offer.productId === productId)!.availableQuantity;
}

/** Arma una venta con `pieces` del producto y llega al paso 2 (Cobro). */
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

const registered = async (page: Page) => {
  await expect(page.getByRole('heading', { name: 'Venta registrada' })).toBeVisible();
  return (await page
    .getByText(/^V-\d{4,}$/)
    .first()
    .textContent())!.trim();
};

/** Venta por API; sin `payments` queda pendiente por el total. */
async function sellByApi(
  page: Page,
  productId: string,
  quantity: string,
  extra: Record<string, unknown> = {},
) {
  const response = await page.request.post('/api/sales', {
    headers: { origin: ORIGIN, 'idempotency-key': randomUUID() },
    data: { items: [{ productId, quantity }], ...extra },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string; folio: string };
}

test.beforeEach(async ({ page }, info) => {
  // El flujo 1 inicia sesión por sí mismo; el 15 usa dos cuentas.
  if (info.title.startsWith('Flujo 1:') || info.title.startsWith('Flujo 15:')) return;
  await signIn(page, owner);
  await expect(page.getByRole('heading', { name: 'Hoy' })).toBeVisible();
});

test('Flujo 1: inicio de sesión correcto', async ({ page }) => {
  await signIn(page, owner);
  await expect(page.getByRole('heading', { name: 'Hoy' })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);
});

test('Flujo 2: registrar un producto', async ({ page }, info) => {
  const name = unique('Tamal', info.project.name);
  await page.goto('/catalogo/nuevo');
  await page.getByLabel('Nombre *').fill(name);
  await page.getByLabel('Precio de venta *').fill('25');
  await page.getByLabel('Costo *').fill('14');
  await page.getByRole('button', { name: 'Guardar producto' }).click();
  await expect(page.getByText('Producto guardado.').last()).toBeVisible();
  await page.getByRole('searchbox', { name: 'Buscar por nombre o código' }).fill(name);
  await expect(page.getByRole('listitem').filter({ hasText: name })).toContainText('$25.00');
  await expectAccessible(page);
});

test('Flujo 3: preparar el día con cantidades', async ({ page }, info) => {
  const name = unique('Atole', info.project.name);
  await page.request.post('/api/products', {
    headers: { origin: ORIGIN },
    data: { name, price: '15', cost: '6' },
  });
  await page.goto('/dia');
  await page.getByRole('button', { name: 'Agregar producto' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Agregar producto' });
  await dialog.getByRole('searchbox').fill(name);
  await dialog.getByRole('button', { name: new RegExp(name) }).click();
  await dialog.getByLabel('Cantidad inicial', { exact: true }).fill('12');
  await dialog.getByRole('button', { name: 'Agregar al día' }).click();
  await expect(page.getByText('Producto agregado al día.').last()).toBeVisible();
  const row = page.getByRole('listitem').filter({ hasText: name });
  await expect(row).toContainText('12');
  await expectAccessible(page);
});

test('Flujo 4: venta pagada por completo en efectivo', async ({ page }, info) => {
  const { id, name } = await stocked(page, 'Tamal', info.project.name, '10');
  await startSale(page, name, 2);
  await expect(page.getByText(/Recibido \$50\.00/)).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar venta · $50.00' }).click();
  await registered(page);
  await expect(page.getByText('Pagada')).toBeVisible();
  expect(await available(page, id)).toBe('8');
  await expectAccessible(page);
});

test('Flujo 5: venta pagada por completo con transferencia', async ({ page }, info) => {
  const { name } = await stocked(page, 'Pozole', info.project.name, '10', '40');
  await startSale(page, name, 1);
  await page.getByRole('button', { name: 'Cambiar método o importes' }).click();
  const sheet = page.getByRole('dialog', { name: 'Cobro' });
  await sheet.getByRole('button', { name: 'Transf.' }).click();
  await sheet.getByRole('button', { name: /Usar este cobro/ }).click();
  await page.getByRole('button', { name: 'Confirmar venta · $40.00' }).click();
  await registered(page);
  await expect(page.getByText('Pagada')).toBeVisible();
  await page.getByRole('link', { name: 'Ver detalle' }).click();
  await expect(page.getByRole('region', { name: 'Historial de pagos' })).toContainText(
    'Transferencia',
  );
});

test('Flujo 6: pago mixto (efectivo y transferencia)', async ({ page }, info) => {
  const { name } = await stocked(page, 'Jugo', info.project.name, '10', '20');
  await startSale(page, name, 3); // $60.00
  await page.getByRole('button', { name: 'Cambiar método o importes' }).click();
  const sheet = page.getByRole('dialog', { name: 'Cobro' });
  await sheet.getByRole('button', { name: 'Mixto' }).click();
  await sheet.getByLabel('Efectivo').fill('35');
  await sheet.getByLabel('Transferencia').fill('25');
  await expectAccessible(page);
  await sheet.getByRole('button', { name: 'Usar este cobro · $60.00' }).click();
  await page.getByRole('button', { name: 'Confirmar venta · $60.00' }).click();
  await registered(page);
  await expect(page.getByText('Pagada')).toBeVisible();
  await page.getByRole('link', { name: 'Ver detalle' }).click();
  const payments = page.getByRole('region', { name: 'Historial de pagos' });
  await expect(payments).toContainText('Efectivo');
  await expect(payments).toContainText('Transferencia');
});

test('Flujo 7: venta parcialmente pagada', async ({ page }, info) => {
  const { name } = await stocked(page, 'Gelatina', info.project.name, '10', '12');
  await startSale(page, name, 5); // $60.00
  await page.getByRole('button', { name: 'Cambiar método o importes' }).click();
  const sheet = page.getByRole('dialog', { name: 'Cobro' });
  await sheet.getByLabel('Efectivo').fill('20');
  await expect(sheet.getByText('Suma $20.00. Faltarán $40.00 por pagar.')).toBeVisible();
  await sheet.getByRole('button', { name: 'Usar este cobro · $20.00' }).click();
  await page.getByRole('button', { name: 'Confirmar venta · $60.00' }).click();
  await registered(page);
  await expect(page.getByText('Pendiente', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Ver detalle' }).click();
  await expect(page.getByRole('region', { name: 'Totales' })).toContainText('$40.00');
});

test('Flujo 8: consultar ventas pendientes', async ({ page }, info) => {
  const { id } = await stocked(page, 'Empanada', info.project.name, '10', '22');
  const sale = await sellByApi(page, id, '2', {
    customerReference: unique('Cli', info.project.name),
  });
  await page.goto('/pendientes');
  await expect(page.getByRole('heading', { name: 'Pendientes' })).toBeVisible();
  const card = page.getByRole('listitem').filter({ hasText: sale.folio });
  await expect(card).toContainText('$44.00');
  await expect(card).toContainText('Pendiente');
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);
});

test('Flujo 9: pago posterior que liquida la venta', async ({ page }, info) => {
  const { id } = await stocked(page, 'Sándwich', info.project.name, '10', '35');
  const sale = await sellByApi(page, id, '2'); // $70.00 pendiente
  await page.goto('/pendientes');
  await page
    .getByRole('listitem')
    .filter({ hasText: sale.folio })
    .getByRole('link', { name: `Registrar pago ${sale.folio}` })
    .click();
  await page.getByRole('button', { name: 'Registrar pago' }).click();
  const pay = page.getByRole('dialog', { name: 'Registrar pago' });
  await expect(pay.getByLabel('Efectivo')).toHaveValue('70.00');
  await pay.getByRole('button', { name: 'Registrar pago · $70.00' }).click();
  await expect(page.getByText('Pago registrado.').last()).toBeVisible();
  await expect(page.getByText('Pagada').first()).toBeVisible();
  await page.goto('/pendientes');
  await expect(page.getByRole('listitem').filter({ hasText: sale.folio })).toHaveCount(0);
});

for (const [number, label, period] of [
  [10, 'reporte del día', 'day'],
  [11, 'reportes semanal y mensual', 'week'],
] as const) {
  test(`Flujo ${number}: ${label}`, async ({ page }, info) => {
    const { id } = await stocked(page, 'Reporte', info.project.name, '10', '30');
    await sellByApi(page, id, '2', { payments: [{ method: 'cash', amount: '60.00' }] });
    await page.goto('/reportes');
    await expect(page.getByRole('heading', { name: 'Reportes' })).toBeVisible();

    const periods =
      period === 'day'
        ? ([['Día', 'day']] as const)
        : ([
            ['Semana', 'week'],
            ['Mes', 'month'],
          ] as const);
    for (const [button, key] of periods) {
      await page.getByRole('button', { name: button, exact: true }).click();
      const today = new Date().toISOString().slice(0, 10);
      const data = (await (
        await page.request.get(`/api/reports?period=${key}&date=${today}`)
      ).json()) as { salesTotal: string; collected: string; grossProfit: string };
      await expect(page.getByRole('region', { name: /^Ventas ·/ })).toContainText(
        peso(data.salesTotal),
      );
      await expect(page.getByRole('region', { name: 'Cobrado', exact: true })).toContainText(
        peso(data.collected),
      );
      await expect(page.getByRole('region', { name: 'Utilidad bruta' })).toContainText(
        'no es utilidad neta',
      );
      await expectAccessible(page);
      await expectNoHorizontalScroll(page);
    }
  });
}

test('Flujo 12: cancelar una venta', async ({ page }, info) => {
  const { id } = await stocked(page, 'Quesadilla', info.project.name, '10', '18');
  const sale = await sellByApi(page, id, '2', { payments: [{ method: 'cash', amount: '36.00' }] });
  await page.goto(`/ventas/${sale.id}`);
  await page.getByRole('button', { name: 'Cancelar venta' }).click();
  const dialog = page.getByRole('alertdialog', { name: /¿Cancelar la venta V-/ });
  await dialog.getByLabel('Motivo de la cancelación *').fill('Se capturó por error');
  await dialog.getByRole('button', { name: 'Cancelar venta' }).click();
  await expect(page.getByText('Venta cancelada.').last()).toBeVisible();
  await expect(page.getByText('Por devolver fuera del sistema: $36.00')).toBeVisible();
  await expectAccessible(page);
});

test('Flujo 13: la validación de inventario y su restitución al cancelar', async ({
  page,
}, info) => {
  const { id, name } = await stocked(page, 'Burrito', info.project.name, '3', '30');

  // Pedir más de lo disponible no se registra y se explica.
  await startSale(page, name, 3);
  await sellByApi(page, id, '2'); // otra venta se lleva 2 mientras tanto
  await page.getByRole('button', { name: /Confirmar venta/ }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'No se registró la venta.' }),
  ).toContainText(`Solo quedan 1 de ${name}.`);
  expect(await available(page, id)).toBe('1');

  // Al cancelar la venta de hoy, las piezas vuelven al inventario.
  const sale = await sellByApi(page, id, '1');
  expect(await available(page, id)).toBe('0');
  await page.goto(`/ventas/${sale.id}`);
  await page.getByRole('button', { name: 'Cancelar venta' }).click();
  await page
    .getByRole('alertdialog')
    .getByLabel('Motivo de la cancelación *')
    .fill('Cliente se arrepintió');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancelar venta' }).click();
  await expect(page.getByText('Las piezas volvieron al inventario.')).toBeVisible();
  expect(await available(page, id)).toBe('1');
});

test('Flujo 14: sesión expirada, el borrador se conserva y se vuelve a la venta', async ({
  page,
}, info) => {
  const { name } = await stocked(page, 'Café', info.project.name, '10', '15');
  await startSale(page, name, 2);

  // La sesión deja de valer (cookies fuera) justo antes de confirmar.
  await page.context().clearCookies();
  await page.getByRole('button', { name: /Confirmar venta/ }).click();
  const expired = page.getByRole('dialog', { name: 'Tu sesión expiró' });
  await expect(expired).toBeVisible();
  await expectAccessible(page);
  await expired.getByRole('button', { name: 'Iniciar sesión' }).click();

  await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
  await page.getByLabel('Correo electrónico').fill(owner.email);
  await page.getByLabel('Contraseña').fill(owner.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();

  // Regresa a Nueva venta con el carrito intacto.
  await expect(page).toHaveURL(/\/vender$/);
  await expect(page.getByText('2 piezas · 1 producto')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Confirmar venta · $30.00' }).click();
  await registered(page);
});

test('Flujo 15: una tienda no puede ver los datos de otra', async ({ page, browser }, info) => {
  await signIn(page, owner);
  await expect(page.getByRole('heading', { name: 'Hoy' })).toBeVisible();
  const { id, name } = await stocked(page, 'Privado', info.project.name, '10', '50');
  const sale = await sellByApi(page, id, '1', {
    customerReference: unique('Secreto', info.project.name),
  });

  const context = await browser.newContext({
    baseURL: info.project.use.baseURL,
    viewport: info.project.use.viewport,
  });
  try {
    const intruder = await context.newPage();
    await signIn(intruder, other);
    await expect(intruder.getByRole('heading', { name: 'Hoy' })).toBeVisible();

    // Por API: la venta, el producto y las listas de la otra tienda no existen.
    const direct = await intruder.request.get(`/api/sales/${sale.id}`);
    expect(direct.status()).toBe(404);
    const products = await (await intruder.request.get('/api/products')).text();
    expect(products).not.toContain(name);
    const history = await (await intruder.request.get('/api/sales')).text();
    expect(history).not.toContain(sale.id);

    // Por la interfaz: la ruta de la venta ajena no muestra nada.
    await intruder.goto(`/ventas/${sale.id}`);
    await expect(
      intruder.getByRole('heading', { name: 'Esta venta ya no está disponible' }),
    ).toBeVisible();
    await expect(intruder.getByText(name)).toHaveCount(0);
    await intruder.goto('/catalogo');
    await expect(intruder.getByText(name)).toHaveCount(0);
    await expectAccessible(intruder);
  } finally {
    await context.close();
  }
});
