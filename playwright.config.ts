import * as path from 'node:path';

import { defineConfig, devices } from '@playwright/test';

import { E2E_BASE_URL, IS_LOCAL_TARGET } from './e2e/helpers/env';

/**
 * Unified Playwright configuration — runs locally against the Vite dev
 * server (default) OR against the deployed instance via env vars.
 *
 *   # local (default)
 *   npm run e2e
 *
 *   # deployed instance
 *   E2E_BASE_URL=https://15-236-162-140.nip.io \
 *   E2E_API_URL=https://api.15-236-162-140.nip.io \
 *   npm run e2e
 *
 * Both modes share the same globalSetup (login + project seed) and the
 * same storageState (preloaded session token). The only behavioural
 * difference is `webServer`: for a local target Playwright will start
 * (or reuse) the Vite dev server on :5173; for a remote target it
 * assumes the stack is already reachable and does nothing.
 */

const STORAGE_STATE_PATH = path.resolve(
  __dirname,
  'test-results/e2e-auth-state.json',
);

export default defineConfig({
  testDir: './e2e',

  timeout: 30_000,
  globalTimeout: 300_000,
  expect: { timeout: 5_000 },

  forbidOnly: !!process.env['CI'],
  // Deploy instance introduces real network latency; always allow one retry
  // so intermittent Remotion-player / React-hydration timing does not
  // fail the suite on a first attempt.
  retries: 1,
  workers: process.env['CI'] ? 1 : undefined,

  reporter: [['html', { open: 'never' }], ['list']],

  globalSetup: require.resolve('./e2e/global-setup'),

  use: {
    baseURL: E2E_BASE_URL,
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

  // Start/reuse the Vite dev server only when targeting the local URL.
  // When E2E_BASE_URL points at a remote host we assume it is already up.
  ...(IS_LOCAL_TARGET
    ? {
        webServer: {
          command: 'npm run dev -w apps/web-editor',
          url: E2E_BASE_URL,
          reuseExistingServer: true,
          timeout: 60_000,
        },
      }
    : {}),
});
