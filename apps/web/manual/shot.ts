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
  /** Captura toda la pantalla desplazable, no solo lo visible. */
  fullPage?: boolean;
}

/** Captura `NN-tema-paso.png` en la carpeta del manual, con el recuadro de resaltado si se pide. */
export async function shot(page: Page, name: string, options: ShotOptions = {}) {
  mkdirSync(OUT_DIR, { recursive: true });
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
    fullPage: options.fullPage ?? false,
    animations: 'disabled',
  });
  for (const target of targets) {
    await target.evaluate((el) => {
      const prev = el.getAttribute('data-manual-prev') ?? '';
      el.removeAttribute('data-manual-prev');
      if (prev) el.setAttribute('style', prev);
      else el.removeAttribute('style');
    });
  }
}
