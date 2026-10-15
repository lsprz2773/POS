// Punto de entrada de `npm run manual:capturas`: usa el preparador de las pruebas E2E (base propia, tienda y
// usuarios con valores aleatorios) con la configuración y la tienda de ejemplo del manual.
import { spawnSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';

process.env.E2E_CONFIG = 'apps/web/playwright.manual.config.ts';
process.env.E2E_STORE_NAME = 'Botanas Don Mario (ejemplo)';
process.env.E2E_OWNER_EMAIL = 'mario@ejemplo.test';

// Cada corrida regenera todas las imágenes: se borran las anteriores para que no queden huérfanas.
const folder = new URL('../../../docs/img/manual', import.meta.url).pathname;
try {
  for (const file of readdirSync(folder)) if (file.endsWith('.png')) rmSync(`${folder}/${file}`);
} catch {
  // La carpeta aún no existe.
}

await import('../e2e/run.mjs');

// Con MANUAL_PNG_COMPLETO=1 se conservan las capturas a color completo (pesan unas cinco veces más).
if (!process.env.MANUAL_PNG_COMPLETO) {
  const result = spawnSync(
    'python3',
    ['-I', new URL('./optimizar.py', import.meta.url).pathname, folder],
    {
      stdio: 'inherit',
    },
  );
  if (result.status !== 0)
    console.warn('No se pudo optimizar el peso de las capturas (¿falta Pillow?).');
}
