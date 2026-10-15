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
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    reducedMotion: 'reduce',
    colorScheme: 'light',
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : {},
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
      command: `npx vite --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      env: { API_URL: `http://localhost:${API_PORT}` },
    },
  ],
});
