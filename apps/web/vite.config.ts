import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// `/api` se reenvía al backend local para compartir origen con la web (sin CORS ni dominio).
const api = process.env.API_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true, proxy: { '/api': { target: api, changeOrigin: false } } },
  preview: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: api, changeOrigin: false } },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
