/**
 * Environment-driven URLs for the Playwright E2E suite.
 *
 * Specs, global-setup, and the Playwright config ALL read these through
 * the same helper so there is exactly one place that decides which
 * environment the suite targets. Override by exporting before invoking
 * `playwright test`:
 *
 *   # local (default — hits the Vite dev server + localhost api)
 *   npm run e2e
 *
 *   # deployed instance
 *   E2E_BASE_URL=https://15-236-162-140.nip.io \
 *   E2E_API_URL=https://api.15-236-162-140.nip.io \
 *   npm run e2e
 */

/** Web-editor front-end URL that Playwright navigates to (no trailing slash). */
export const E2E_BASE_URL =
  process.env['E2E_BASE_URL']?.replace(/\/$/, '') ?? 'http://localhost:5173';

/** API URL that global-setup hits for login + project creation. */
export const E2E_API_URL =
  process.env['E2E_API_URL']?.replace(/\/$/, '') ?? 'http://localhost:3001';

/**
 * True when the target front-end URL is the local Vite dev server, in
 * which case the Playwright config will start/reuse `npm run dev` via
 * the `webServer` block. For any non-local URL the suite assumes the
 * target is already reachable and skips `webServer`.
 */
export const IS_LOCAL_TARGET =
  E2E_BASE_URL === 'http://localhost:5173' ||
  E2E_BASE_URL === 'http://127.0.0.1:5173';
