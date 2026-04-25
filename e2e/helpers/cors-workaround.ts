/**
 * CORS workaround for E2E tests running against the deployed HTTPS instance.
 *
 * The deployed Vite bundle is built with
 * VITE_PUBLIC_API_BASE_URL=http://localhost:3001. When Playwright's browser
 * at https://15-236-162-140.nip.io makes requests the browser's Origin is
 * rejected by the API CORS allowlist (mixed-content block + CORS mismatch).
 *
 * installCorsWorkaround installs two route interceptors:
 *   1. GET any-url/auth/me — fulfills with hardcoded dev-user payload so
 *      AuthProvider authenticates without reaching the CORS-blocked API.
 *   2. http://localhost:3001/** — proxies ALL requests via page.request
 *      (no browser CORS) to the real deployed API (E2E_API_URL) so every
 *      API call the editor makes can succeed.
 *
 * On IS_LOCAL_TARGET the function is a no-op — local dev serves the app on
 * localhost:5173 which hits localhost:3001 directly without CORS issues.
 */

import type { Page } from '@playwright/test';

import { E2E_API_URL, IS_LOCAL_TARGET } from './env';

/**
 * Installs CORS workaround route interceptors on the given Playwright page.
 *
 * Must be called BEFORE page.goto() so the interceptors are registered before
 * the first network request is made.
 *
 * @param page  - The Playwright Page instance.
 * @param token - Bearer token to forward in proxied requests.
 */
export async function installCorsWorkaround(
  page: Page,
  token: string,
): Promise<void> {
  if (IS_LOCAL_TARGET) return;

  // Intercept auth/me — return hardcoded dev-user payload so the AuthProvider
  // considers the user authenticated without reaching the CORS-blocked API.
  await page.route('**/auth/me', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          userId: 'dev-user-001',
          email: 'dev@cliptale.local',
          displayName: 'Dev User',
        }),
      });
    }
    return route.continue();
  });

  // Proxy ALL localhost:3001 requests to E2E_API_URL via page.request.
  // page.request runs in Node.js context so there are no browser CORS
  // restrictions. The fulfilled response includes access-control-allow-origin
  // because the browser still evaluates CORS headers on fulfilled responses
  // (see feedback_playwright_cors_proxy.md).
  await page.route('http://localhost:3001/**', async (route) => {
    const original = route.request();
    const rewrittenUrl = original
      .url()
      .replace('http://localhost:3001', E2E_API_URL);

    try {
      const postData = original.postDataBuffer();
      const proxyRes = await page.request.fetch(rewrittenUrl, {
        method: original.method(),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        ...(postData && postData.length > 0 ? { data: postData } : {}),
      });

      await route.fulfill({
        status: proxyRes.status(),
        headers: {
          ...proxyRes.headers(),
          'access-control-allow-origin': '*',
          'access-control-allow-credentials': 'true',
        },
        body: await proxyRes.body(),
      });
    } catch {
      await route.continue().catch(() => {
        /* best-effort — ignore if the route is already handled */
      });
    }
  });
}
