import { defineConfig } from '@playwright/test';

const WEB_PORT = 5183;
const API_PORT = 3100;

// Genera las capturas del manual de usuario (docs/manual-usuario.md). No forma parte de la CI: se corre con
// `npm run manual:capturas`, que prepara la base de ejemplo con `e2e/run.mjs`.
export default defineConfig({
  testDir: './manual',
  fullyParallel: false,
  workers: 1,
  timeout: 300_000,
  // Si un paso no encuentra su elemento, falla pronto en lugar de esperar minutos.
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    actionTimeout: 10_000,
    reducedMotion: 'reduce',
    colorScheme: 'light',
    // La interfaz se ve como la ve el usuario: fechas y horas en formato de México.
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
    // Los campos de fecha y hora nativos toman el idioma del navegador: así salen como en México (dd/mm/aaaa).
    launchOptions: {
      args: ['--lang=es-MX'],
      env: { ...process.env, LANGUAGE: 'es_MX:es', LC_ALL: 'es_MX.UTF-8', LANG: 'es_MX.UTF-8' },
      ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
    },
  },
  projects: [
    {
      name: 'manual',
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
  webServer: [
    {
      command: 'npm run start -w @pos/api',
      cwd: '../..',
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
      env: { PORT: String(API_PORT), APP_ORIGIN: `http://localhost:${WEB_PORT}` },
    },
    {
      // Compilación de producción: sin el doble montaje del modo desarrollo (avisos duplicados).
      command: `npx vite build && npx vite preview --port ${WEB_PORT}`,
      timeout: 120_000,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      env: { API_URL: `http://localhost:${API_PORT}` },
    },
  ],
});
