import { defineConfig } from '@playwright/test';

const WEB_PORT = 5183;
const API_PORT = 3100;

// `e2e/run.mjs` prepara la base y las variables; no se invoca Playwright directamente.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    // En el contenedor de desarrollo el navegador viene preinstalado; en CI se instala con Playwright.
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : {},
  },
  projects: [
    {
      name: 'movil',
      use: { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true },
    },
    { name: 'escritorio', use: { viewport: { width: 1280, height: 800 } } },
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
