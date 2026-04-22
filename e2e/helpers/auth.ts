/**
 * Shared auth helper for E2E tests.
 *
 * Logs in via POST /auth/login (API-level, no UI) and creates a reusable
 * empty project. Used by `global-setup.ts` to seed a Playwright
 * storageState that pre-populates `localStorage.auth_token` on the
 * target origin, bypassing the flaky UI login flow and the login rate
 * limiter.
 *
 * The seed user is inserted by apps/web-editor/e2e/seed-test-user.sql:
 *   email:    e2e@cliptale.test
 *   password: TestPassword123!
 *
 * Base URLs are env-driven — see `./env.ts`.
 */

import { E2E_API_URL } from './env';

export const E2E_TEST_EMAIL = 'e2e@cliptale.test';
export const E2E_TEST_PASSWORD = 'TestPassword123!';

/**
 * Token returned by `POST /auth/login`. The FE stores this in
 * `localStorage.auth_token` on the target origin — same key used by
 * `apps/web-editor/src/lib/api-client.ts`.
 */
export const AUTH_TOKEN_LOCAL_STORAGE_KEY = 'auth_token';

/**
 * Calls the target API to authenticate the seeded e2e user and returns
 * the session token. Throws with a descriptive message on non-200 so
 * `global-setup` fails fast instead of letting every spec time out on
 * a missing token.
 */
export async function loginViaE2eApi(): Promise<string> {
  const res = await fetch(`${E2E_API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: E2E_TEST_EMAIL, password: E2E_TEST_PASSWORD }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '<unreadable>');
    throw new Error(
      `E2E login failed (${res.status}): ${body}. ` +
        `Ensure apps/web-editor/e2e/seed-test-user.sql has been applied to the target DB (${E2E_API_URL}).`,
    );
  }

  const data = (await res.json()) as { token?: string };
  if (!data.token) {
    throw new Error('E2E login response missing token field');
  }
  return data.token;
}

/**
 * Creates a new empty project for the e2e user on the target API and
 * returns its UUID. Reused across every spec via `?projectId=<id>` so
 * tests do not repeatedly POST /projects (which accumulates rows and
 * can race with rate-limits during a large run).
 */
export async function createE2eProject(token: string): Promise<string> {
  const res = await fetch(`${E2E_API_URL}/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ title: 'E2E smoke project' }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '<unreadable>');
    throw new Error(`E2E project creation failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { projectId?: string };
  if (!data.projectId) {
    throw new Error('E2E project creation response missing projectId');
  }
  return data.projectId;
}
