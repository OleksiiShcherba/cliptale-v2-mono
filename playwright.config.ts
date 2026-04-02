import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for ClipTale E2E tests.
 *
 * The web-editor service is exposed on port 5173 via Docker Compose.
 * When running locally outside Docker the same port is used by the Vite
 * dev server (apps/web-editor dev script).
 *
 * The `webServer` block will start the Vite dev server automatically when
 * the port is not already in use (e.g. Docker Compose is not running).
 */
export default defineConfig({
  testDir: './e2e',

  /* Maximum time one test can run. */
  timeout: 30_000,

  /* Maximum time to wait for the full test run. */
  globalTimeout: 300_000,

  expect: {
    /** Maximum time expect() assertions wait for the condition to be met. */
    timeout: 5_000,
  },

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    /** Base URL pointing at the web-editor Docker Compose service. */
    baseURL: 'http://localhost:5173',

    /* Collect trace on retry to simplify debugging. */
    trace: 'on-first-retry',

    /* Screenshots on failure. */
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /**
   * Start the Vite dev server automatically when port 5173 is not already
   * bound (i.e. Docker Compose is not running).  The `reuseExistingServer`
   * flag ensures we do NOT start a second server when Docker is up.
   */
  webServer: {
    command: 'npm run dev -w apps/web-editor',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
