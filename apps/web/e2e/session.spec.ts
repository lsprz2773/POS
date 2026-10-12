import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const owner = { email: process.env.E2E_OWNER_EMAIL!, password: process.env.E2E_OWNER_PASSWORD! };
const orphan = { email: process.env.E2E_ORPHAN_EMAIL!, password: process.env.E2E_ORPHAN_PASSWORD! };

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(user.email);
  await page.getByLabel('Contraseña').fill(user.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('sin sesión, cualquier pantalla lleva al inicio de sesión', async ({ page }) => {
  await page.goto('/pendientes');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);
});

test('credenciales incorrectas dan un mensaje genérico', async ({ page }) => {
  await signIn(page, { email: owner.email, password: 'incorrecta-1234' });
  await expect(page.getByRole('alert')).toContainText('Correo o contraseña incorrectos.');
  await expect(page).toHaveURL(/\/login$/);
});

test('el propietario entra, navega, y cierra sesión', async ({ page, isMobile }) => {
  await signIn(page, owner);
  await expect(page.getByRole('heading', { name: 'Hoy' })).toBeVisible();
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);

  // Móvil: barra inferior; escritorio: barra lateral. Ambas con el mismo nombre accesible.
  const nav = page
    .getByRole('navigation', { name: 'Navegación principal' })
    .and(page.locator(isMobile ? '.tabbar' : '.side nav'));
  await expect(nav).toBeVisible();

  await nav.getByRole('link', { name: 'Más' }).click();
  await expect(page.getByRole('heading', { name: 'Más' })).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('link', { name: 'Perfil' }).click();
  await expect(page.getByText(owner.email)).toBeVisible();
  await expect(page.getByText('Tamales E2E')).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Cerraste sesión.');

  // Cerrada la sesión, volver atrás no muestra datos de la tienda.
  await page.goto('/perfil');
  await expect(page).toHaveURL(/\/login$/);
});

test('el teclado llega al contenido con el enlace de salto', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Prueba de teclado: solo en escritorio.');
  await signIn(page, owner);
  await expect(page.getByRole('heading', { name: 'Hoy' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused();
});

test('una cuenta sin tienda ve el aviso y solo puede cerrar sesión', async ({ page }) => {
  await signIn(page, orphan);
  await expect(
    page.getByRole('heading', { name: 'Tu cuenta aún no tiene una tienda' }),
  ).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
});

test('en modo oscuro y con movimiento reducido la app sigue legible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
  await expectAccessible(page);
});
