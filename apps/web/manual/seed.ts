import { randomUUID } from 'node:crypto';
import { expect, type Browser, type Page, type TestInfo } from '@playwright/test';
import { ORIGIN, signIn } from '../e2e/helpers';

// Datos ficticios para que Hoy, Pendientes, Historial y Reportes tengan contenido real en las capturas.
export const CATALOG = [
  { name: 'Cacahuate japonés', price: '25', cost: '14', quantity: '40' },
  { name: 'Cacahuate salado', price: '20', cost: '11', quantity: '40' },
  { name: 'Garapiñado', price: '30', cost: '17', quantity: '30' },
  { name: 'Palanqueta', price: '15', cost: '8', quantity: '50' },
  { name: 'Pepitas con chile', price: '22', cost: '12', quantity: '30' },
];

export interface Product {
  id: string;
  name: string;
  price: string;
}

export interface Sale {
  id: string;
  folio: string;
}

const headers = () => ({ origin: ORIGIN });

export async function createProduct(
  page: Page,
  product: (typeof CATALOG)[number],
): Promise<Product> {
  const { name, price, cost } = product;
  const response = await page.request.post('/api/products', {
    headers: headers(),
    data: { name, price, cost },
  });
  expect(response.status(), await response.text()).toBe(201);
  return { id: ((await response.json()) as { id: string }).id, name, price };
}

export async function offerToday(page: Page, productId: string, quantity: string) {
  const response = await page.request.post('/api/workdays/today/offers', {
    headers: headers(),
    data: { productId, quantity },
  });
  expect(response.status(), await response.text()).toBe(201);
}

/** Venta por API. Sin `payments` queda pendiente por el total. */
export async function sell(
  page: Page,
  items: { productId: string; quantity: string }[],
  extra: Record<string, unknown> = {},
): Promise<Sale> {
  const response = await page.request.post('/api/sales', {
    headers: { ...headers(), 'idempotency-key': randomUUID() },
    data: { items, ...extra },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as Sale;
}

export async function createSeller(
  page: Page,
  displayName: string,
  email: string,
  password: string,
) {
  const response = await page.request.post('/api/team/sellers', {
    headers: headers(),
    data: { displayName, email, password },
  });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

/** Sesión aparte (otro navegador) con el mismo formato móvil, para capturar lo que ve otra persona. */
export async function mobileSession(
  browser: Browser,
  info: TestInfo,
  user?: { email: string; password: string },
): Promise<Page> {
  const context = await browser.newContext({
    baseURL: info.project.use.baseURL,
    viewport: info.project.use.viewport,
    deviceScaleFactor: info.project.use.deviceScaleFactor,
    hasTouch: info.project.use.hasTouch,
    isMobile: info.project.use.isMobile,
    reducedMotion: 'reduce',
    colorScheme: 'light',
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
  });
  const page = await context.newPage();
  if (user) await signIn(page, user);
  return page;
}
