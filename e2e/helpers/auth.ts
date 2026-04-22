/**
 * Shared auth helper for E2E tests.
 *
 * Logs in via POST /auth/login (API-level, no UI) and returns the session
 * token. Used by `playwright.deploy.config.ts` global setup to seed a
 * reusable storageState for all tests, bypassing the flaky UI login flow.
 *
 * The seed user is inserted by apps/web-editor/e2e/seed-test-user.sql into
 * the users table on the deploy instance:
 *   email:    e2e@cliptale.test
 *   password: TestPassword123!
 *
 * When `APP_CORS_ORIGIN` is set to the public host, Playwright cannot POST
 * from a localhost baseURL — so deploy E2E always targets the public
 * hostname declared in `playwright.deploy.config.ts`.
 */

export const DEPLOY_BASE_URL = 'https://15-236-162-140.nip.io';
export const DEPLOY_API_URL = 'https://api.15-236-162-140.nip.io';

export const E2E_TEST_EMAIL = 'e2e@cliptale.test';
export const E2E_TEST_PASSWORD = 'TestPassword123!';

/**
 * Token returned by `POST /auth/login`. The FE stores this in
 * `localStorage.auth_token` on the deploy origin — same key used by
 * `lib/api-client.ts`.
 */
export const AUTH_TOKEN_LOCAL_STORAGE_KEY = 'auth_token';

/**
 * Calls the deploy API to authenticate the seeded e2e user and returns
 * the session token. Throws with a descriptive message on non-200 so the
 * global-setup fails fast instead of letting every spec time out on a
 * missing token.
 */
export async function loginViaDeployApi(): Promise<string> {
  const res = await fetch(`${DEPLOY_API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: E2E_TEST_EMAIL, password: E2E_TEST_PASSWORD }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '<unreadable>');
    throw new Error(
      `E2E login failed (${res.status}): ${body}. ` +
        `Ensure apps/web-editor/e2e/seed-test-user.sql has been applied to the deploy DB.`,
    );
  }

  const data = (await res.json()) as { token?: string };
  if (!data.token) {
    throw new Error('E2E login response missing token field');
  }
  return data.token;
}

/**
 * Creates a new empty project for the e2e user on the deploy API and
 * returns its UUID. Reused across every spec via `?projectId=<id>` so
 * tests do not repeatedly POST /projects (which accumulates rows and
 * can race with rate-limits during a large run).
 */
export async function createE2eProject(token: string): Promise<string> {
  const res = await fetch(`${DEPLOY_API_URL}/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
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
