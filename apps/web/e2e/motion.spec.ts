// Animaciones y transiciones (movimiento normal): entrada de pantalla, diálogos con salida y respeto de
// "reducir movimiento". El resto de las pruebas corren con ese ajuste (ver playwright.config.ts).
import { expect, test, type Page } from '@playwright/test';
import { expectAccessible, ORIGIN, owner, signIn, unique } from './helpers';

test.beforeEach(async ({ page }) => {
  await signIn(page, owner);
  await expect(page.getByRole('heading', { name: 'Hoy' })).toBeVisible();
});

const animationOf = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => getComputedStyle(el).animationName);

const settled = (page: Page) =>
  expect
    .poll(() =>
      page.evaluate(
        () =>
          document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity)
            .length,
      ),
    )
    .toBe(0);

test.describe('con movimiento normal', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('las pantallas entran con animación y quedan accesibles al terminar', async ({ page }) => {
    await page.goto('/historial');
    await expect(page.getByRole('heading', { name: 'Historial' })).toBeVisible();
    expect(await animationOf(page, 'main .page-in > *')).toContain('rise');
    await settled(page);
    await expectAccessible(page);
  });

  test('la hoja de filtro entra animada y al cerrar devuelve el foco', async ({ page }, info) => {
    await page.goto('/historial');
    const opener = page.getByRole('button', { name: 'Todas las fechas' });
    await opener.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const entering = await dialog.evaluate((el) => getComputedStyle(el).animationName);
    expect(entering).toBe(info.project.name === 'movil' ? 'sheet-up' : 'dialog-in');
    await settled(page);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('el interruptor mueve su perilla con una transición', async ({ page }, info) => {
    const name = unique('Movimiento', info.project.name);
    await page.request.post('/api/products', {
      headers: { origin: ORIGIN },
      data: { name, price: '10', cost: '4' },
    });
    await page.goto('/catalogo');
    const toggle = page.getByRole('switch').first();
    await expect(toggle).toBeVisible();
    const duration = await toggle.evaluate(
      (el) => getComputedStyle(el, '::after').transitionDuration,
    );
    expect(duration).not.toBe('0s');
  });
});

test.describe('reducir movimiento', () => {
  test.use({ reducedMotion: 'reduce' });

  test('las entradas no se animan: ni pantallas ni hojas pasan por un estado a medias', async ({
    page,
  }) => {
    await page.goto('/historial');
    await expect(page.getByRole('heading', { name: 'Historial' })).toBeVisible();
    const nameOf = (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((el) => getComputedStyle(el).animationName);
    expect(await nameOf('main .page-in > *')).toBe('none');

    await page.getByRole('button', { name: 'Todas las fechas' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await nameOf('.sheet')).toBe('none');
    expect(await nameOf('.scrim')).toBe('none');
  });
});
