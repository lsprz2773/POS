import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import {
  expectAccessible,
  expectNoHorizontalScroll,
  owner,
  signIn,
  storeToday,
  unique,
} from './helpers';

const ORIGIN = 'http://localhost:5183';
const peso = (amount: string) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(amount));

test.beforeEach(async ({ page }) => {
  await signIn(page, owner);
  await expect(page.getByRole('heading', { name: 'Hoy' })).toBeVisible();
});

/** Producto con existencias hoy y una venta de `pieces` piezas (opcionalmente pagada). */
async function sell(
  page: Page,
  project: string,
  options: { pieces: number; reference: string; paid?: boolean; price?: string },
) {
  const name = unique('Producto', project);
  const created = await page.request.post('/api/products', {
    headers: { origin: ORIGIN },
    data: { name, price: options.price ?? '25', cost: '14' },
  });
  const product = (await created.json()) as { id: string };
  await page.request.post('/api/workdays/today/offers', {
    headers: { origin: ORIGIN },
    data: { productId: product.id, quantity: '50' },
  });
  const sale = await page.request.post('/api/sales', {
    headers: { origin: ORIGIN, 'idempotency-key': randomUUID() },
    data: {
      items: [{ productId: product.id, quantity: String(options.pieces) }],
      customerReference: options.reference,
      ...(options.paid
        ? {
            payments: [
              { method: 'cash', amount: String(options.pieces * Number(options.price ?? 25)) },
            ],
          }
        : {}),
    },
  });
  expect(sale.status()).toBe(201);
  return (await sale.json()) as { id: string; folio: string };
}

test('Hoy muestra lo mismo que calcula el servidor', async ({ page }, info) => {
  await sell(page, info.project.name, {
    pieces: 2,
    reference: unique('Hoy', info.project.name),
    paid: true,
  });
  const dashboard = (await (await page.request.get('/api/dashboard')).json()) as {
    salesTotal: string;
    salesCount: number;
    collected: string;
    pendingTotal: string;
    estimatedGrossProfit: string;
    collectedByMethod: { cash: string; transfer: string };
  };

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Hoy' })).toBeVisible();
  const sales = page.getByRole('region', { name: /^Ventas del día/ });
  await expect(sales).toContainText(peso(dashboard.salesTotal));
  await expect(sales).toContainText(`${dashboard.salesCount} venta`);
  await expect(page.getByRole('region', { name: 'Cobrado', exact: true })).toContainText(
    peso(dashboard.collected),
  );
  await expect(page.getByRole('link', { name: /Falta por cobrar/ })).toContainText(
    peso(dashboard.pendingTotal),
  );
  await expect(page.getByRole('region', { name: 'Cobrado por método' })).toContainText(
    peso(dashboard.collectedByMethod.cash),
  );
  await expect(page.getByRole('region', { name: 'Utilidad bruta estimada' })).toContainText(
    'no es utilidad neta',
  );
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);

  await page.getByRole('link', { name: 'Nueva venta' }).click();
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible();
});

test('historial: busca, filtra por estado, abre el detalle y refleja una cancelación', async ({
  page,
}, info) => {
  const reference = unique('Cliente', info.project.name);
  const paidRef = unique('Pagada', info.project.name);
  const pending = await sell(page, info.project.name, { pieces: 2, reference });
  await sell(page, info.project.name, { pieces: 1, reference: paidRef, paid: true });

  await page.goto('/historial');
  await expect(page.getByRole('heading', { name: 'Historial' })).toBeVisible();
  await expectAccessible(page);

  // Búsqueda por cliente/referencia y por folio.
  const search = page.getByRole('searchbox', { name: 'Buscar por folio o cliente' });
  await search.fill(reference);
  const row = page.getByRole('link', { name: new RegExp(pending.folio) });
  await expect(row).toBeVisible();
  await expect(row).toContainText(reference);
  await expect(row).toContainText('Pendiente');
  await expect(page.getByRole('link', { name: new RegExp(paidRef) })).toHaveCount(0);
  await search.fill(pending.folio);
  await expect(row).toBeVisible();
  await search.fill('');

  // Filtros por estado.
  await search.fill(paidRef);
  await page.getByRole('button', { name: 'Pagadas' }).click();
  await expect(page.getByRole('link', { name: new RegExp(paidRef) })).toBeVisible();
  await page.getByRole('button', { name: 'Pendientes' }).click();
  await expect(page.getByRole('heading', { name: 'No encontramos ventas' })).toBeVisible();
  await search.fill(reference);
  await expect(row).toBeVisible();
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);

  // Cancelarla desde el detalle: pasa a "Canceladas".
  await row.click();
  await page.getByRole('button', { name: 'Cancelar venta' }).click();
  await page
    .getByRole('alertdialog')
    .getByLabel('Motivo de la cancelación *')
    .fill('Prueba de historial');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancelar venta' }).click();
  await expect(page.getByText('Venta cancelada.').last()).toBeVisible();

  await page.goto('/historial');
  await page.getByRole('searchbox', { name: 'Buscar por folio o cliente' }).fill(reference);
  await page.getByRole('button', { name: 'Canceladas' }).click();
  await expect(page.getByRole('link', { name: new RegExp(pending.folio) })).toContainText(
    'Cancelada',
  );
  await page.getByRole('button', { name: 'Pendientes' }).click();
  await expect(page.getByRole('heading', { name: 'No encontramos ventas' })).toBeVisible();
});

test('reportes: la semana, el día y el mes coinciden con el servidor y el rango se valida', async ({
  page,
}, info) => {
  await sell(page, info.project.name, {
    pieces: 3,
    reference: unique('Rep', info.project.name),
    paid: true,
    price: '30',
  });

  await page.goto('/reportes');
  await expect(page.getByRole('heading', { name: 'Reportes' })).toBeVisible();
  const report = await (async () => {
    const week = await page.getByRole('region', { name: /^Ventas ·/ }).textContent();
    return week;
  })();
  expect(report).toContain('Ventas');

  for (const [label, period] of [
    ['Semana', 'week'],
    ['Día', 'day'],
    ['Mes', 'month'],
  ] as const) {
    await page.getByRole('button', { name: label, exact: true }).click();
    const today = storeToday();
    const response = await page.request.get(`/api/reports?period=${period}&date=${today}`);
    const data = (await response.json()) as {
      salesTotal: string;
      collected: string;
      costOfGoodsSold: string;
      grossProfit: string;
    };
    await expect(page.getByRole('region', { name: /^Ventas ·/ })).toContainText(
      peso(data.salesTotal),
    );
    await expect(page.getByRole('region', { name: 'Cobrado', exact: true })).toContainText(
      peso(data.collected),
    );
    await expect(page.getByRole('region', { name: 'Utilidad bruta' })).toContainText(
      peso(data.costOfGoodsSold),
    );
    await expect(page.getByRole('region', { name: 'Utilidad bruta' })).toContainText(
      'no es utilidad neta',
    );
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);
  }

  // Periodo anterior y siguiente.
  await page.getByRole('button', { name: 'Periodo anterior' }).click();
  await expect(page.getByRole('button', { name: 'Periodo siguiente' })).toBeEnabled();

  // Rango personalizado con validación.
  await page.getByRole('button', { name: 'Rango' }).click();
  await page.getByRole('button', { name: 'Aplicar rango' }).click();
  await expect(page.getByLabel('Hasta')).toHaveAccessibleDescription('Elige las dos fechas.');
  await page.getByLabel('Desde').fill('2026-10-10');
  await page.getByLabel('Hasta').fill('2026-10-01');
  await page.getByRole('button', { name: 'Aplicar rango' }).click();
  await expect(page.getByLabel('Hasta')).toHaveAccessibleDescription(/anterior a la inicial/);
  await expectAccessible(page);
  await page.getByLabel('Desde').fill('2020-01-01');
  await page.getByLabel('Hasta').fill(storeToday());
  await page.getByRole('button', { name: 'Aplicar rango' }).click();
  await expect(page.getByLabel('Hasta')).toHaveAccessibleDescription(/366 días/);
});

test('un periodo sin ventas muestra ceros y lo explica', async ({ page }) => {
  await page.goto('/reportes');
  await page.getByRole('button', { name: 'Rango' }).click();
  await page.getByLabel('Desde').fill('2000-01-01');
  await page.getByLabel('Hasta').fill('2000-01-07');
  await page.getByRole('button', { name: 'Aplicar rango' }).click();
  await expect(page.getByText('No hay ventas en este periodo.')).toBeVisible();
  await expect(page.getByRole('region', { name: /^Ventas ·/ })).toContainText('$0.00');
  await expectAccessible(page);
});
