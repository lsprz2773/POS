import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Locator, Page } from '@playwright/test';

/** Carpeta de las imágenes del manual (se versionan, ver decisión T116). */
export const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/img/manual');

const HIGHLIGHT =
  'outline: 3px solid #e11d48 !important; outline-offset: 3px; border-radius: 10px;';

interface ShotOptions {
  /** Elementos que se rodean con un recuadro para indicar dónde tocar. */
  highlight?: Locator | Locator[];
  /** Captura toda la pantalla desplazable: se alarga la ventana, así la barra inferior queda al final. */
  fullPage?: boolean;
  /** Conserva los avisos flotantes visibles; por omisión se espera a que desaparezcan. */
  toast?: boolean;
}

/** Captura `NN-tema-paso.png` en la carpeta del manual, con el recuadro de resaltado si se pide. */
export async function shot(page: Page, name: string, options: ShotOptions = {}) {
  mkdirSync(OUT_DIR, { recursive: true });
  if (!options.toast) {
    await page
      .locator('.toast')
      .first()
      .waitFor({ state: 'detached', timeout: 12_000 })
      .catch(() => undefined);
  }
  const original = page.viewportSize();
  if (options.fullPage && original) {
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({
      width: original.width,
      height: Math.min(Math.max(height, original.height), 3200),
    });
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
  }
  const targets = [options.highlight ?? []].flat();
  for (const target of targets) {
    await target.evaluate((el, css) => {
      el.setAttribute('data-manual-prev', el.getAttribute('style') ?? '');
      el.setAttribute('style', `${el.getAttribute('style') ?? ''};${css}`);
    }, HIGHLIGHT);
  }
  // Sin cursor ni foco visibles de los campos para que las capturas salgan limpias.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.screenshot({
    path: resolve(OUT_DIR, `${name}.png`),
    animations: 'disabled',
  });
  if (options.fullPage && original) await page.setViewportSize(original);
  for (const target of targets) {
    await target.evaluate((el) => {
      const prev = el.getAttribute('data-manual-prev') ?? '';
      el.removeAttribute('data-manual-prev');
      if (prev) el.setAttribute('style', prev);
      else el.removeAttribute('style');
    });
  }
}
