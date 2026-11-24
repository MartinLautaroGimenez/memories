import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas de punta a punta. Necesitan la app corriendo con una base vacía:
 *   pnpm build && pnpm start   (con DATABASE_URL apuntando a una base de pruebas)
 *   E2E_BASE_URL=http://localhost:3000 pnpm test:e2e
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'off',
    viewport: { width: 1366, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } }],
});
