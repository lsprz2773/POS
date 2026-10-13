import { defineConfig } from '@playwright/test';

// Los 15 flujos contra un entorno ya desplegado (staging). No levanta servidores: usa E2E_BASE_URL y las
// cuentas E2E_OWNER_* y E2E_OTHER_* (dos tiendas de pruebas distintas). Ver docs/manual-despliegue.md.
const baseURL = process.env.E2E_BASE_URL;
if (!baseURL) throw new Error('Falta E2E_BASE_URL (la dirección de staging).');

export default defineConfig({
  testDir: './e2e',
  testMatch: 'flujos.spec.ts',
  fullyParallel: false,
  workers: 1,
  // La primera petición tras un rato inactivo despierta la Lambda y la base (Neon): se da más margen.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: baseURL.replace(/\/$/, ''),
    trace: 'retain-on-failure',
    reducedMotion: 'reduce',
  },
  projects: [
    {
      name: 'movil',
      use: { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true },
    },
    { name: 'escritorio', use: { viewport: { width: 1280, height: 800 } } },
  ],
});
