import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** Origen de la aplicación bajo prueba: local por omisión, o la dirección de staging (E2E_BASE_URL). */
export const ORIGIN = process.env.E2E_BASE_URL?.replace(/\/$/, '') ?? 'http://localhost:5183';

export const owner = {
  email: process.env.E2E_OWNER_EMAIL!,
  password: process.env.E2E_OWNER_PASSWORD!,
};
export const other = {
  email: process.env.E2E_OTHER_EMAIL!,
  password: process.env.E2E_OTHER_PASSWORD!,
};
export const orphan = {
  email: process.env.E2E_ORPHAN_EMAIL!,
  password: process.env.E2E_ORPHAN_PASSWORD!,
};

export async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(user.email);
  await page.getByLabel('Contraseña').fill(user.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

/** Revisión automática de accesibilidad (WCAG 2.2 AA) de lo que hay en pantalla. */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Texto único por ejecución y proyecto: las pruebas comparten base de datos. */
export const unique = (label: string, project: string) =>
  `${label} ${project} ${Date.now().toString(36)}`;

/** Hoy (AAAA-MM-DD) en la zona de la tienda de las pruebas; la fecha UTC se adelanta por las tardes-noches. */
export const storeToday = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
