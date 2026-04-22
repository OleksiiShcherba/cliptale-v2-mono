import * as path from 'node:path';

import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for E2E tests against the deployed instance
 * at https://15-236-162-140.nip.io.
 *
 * Differs from the base `playwright.config.ts` (which targets a local
 * `localhost:5173` Vite dev server) in three ways:
 *
 * 1. `baseURL` points at the public host so the FE resolves
 *    `VITE_PUBLIC_API_BASE_URL=https://api.15-236-162-140.nip.io` and the
 *    API's CORS allow-list accepts the origin.
 * 2. `globalSetup` calls `POST /auth/login` once and writes a
 *    Playwright `storageState` file containing the session token on the
 *    deploy origin.
 * 3. Every project pre-loads that storageState so specs start
 *    authenticated — no per-test UI login, no rate-limit pressure.
 *
 * Requires the seeded e2e user from
 * `apps/web-editor/e2e/seed-test-user.sql` to exist in the deploy DB.
 */

const STORAGE_STATE_PATH = path.resolve(
  __dirname,
  'test-results/e2e-deploy-auth-state.json',
);

export default defineConfig({
  testDir: './e2e',

  timeout: 30_000,
  globalTimeout: 300_000,
  expect: { timeout: 5_000 },

  forbidOnly: !!process.env['CI'],
  // Deploy instance has real network latency; allow one retry for flakes
  // caused by slow project-hydration or Remotion player mount races.
  retries: 1,
  workers: process.env['CI'] ? 1 : undefined,

  reporter: [['html', { open: 'never' }], ['list']],

  globalSetup: require.resolve('./e2e/global-setup'),

  use: {
    baseURL: 'https://15-236-162-140.nip.io',
    storageState: STORAGE_STATE_PATH,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
