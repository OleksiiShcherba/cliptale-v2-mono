/**
 * Playwright global setup for the deploy config.
 *
 * Runs once before all specs: obtains a session token via the deploy API
 * and writes a Playwright `storageState` JSON that pre-populates
 * `localStorage.auth_token` on the deploy origin. Each spec project
 * references this file via `use.storageState`, so every test starts
 * already authenticated — no repeated UI login, no rate-limit pressure.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  AUTH_TOKEN_LOCAL_STORAGE_KEY,
  DEPLOY_API_URL,
  DEPLOY_BASE_URL,
  createE2eProject,
  loginViaDeployApi,
} from './helpers/auth';
import { E2E_CONTEXT_PATH, writeE2eContext } from './helpers/e2e-context';

export const STORAGE_STATE_PATH = path.resolve(
  __dirname,
  '../test-results/e2e-deploy-auth-state.json',
);

/**
 * Reads the last-run token from disk (if any) and validates it with
 * `GET /auth/me`. Returns the token on success, null otherwise. Lets
 * globalSetup skip re-logging-in during the 15-minute rate-limit window
 * on the `POST /auth/login` endpoint.
 */
async function reuseExistingToken(): Promise<string | null> {
  if (!fs.existsSync(STORAGE_STATE_PATH)) return null;
  try {
    const state = JSON.parse(fs.readFileSync(STORAGE_STATE_PATH, 'utf-8')) as {
      origins?: Array<{ localStorage?: Array<{ name: string; value: string }> }>;
    };
    const token = state.origins?.[0]?.localStorage?.find(
      (e) => e.name === AUTH_TOKEN_LOCAL_STORAGE_KEY,
    )?.value;
    if (!token) return null;

    const probe = await fetch(`${DEPLOY_API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return probe.ok ? token : null;
  } catch {
    return null;
  }
}

async function reuseOrCreateProject(token: string): Promise<string> {
  if (fs.existsSync(E2E_CONTEXT_PATH)) {
    try {
      const ctx = JSON.parse(fs.readFileSync(E2E_CONTEXT_PATH, 'utf-8')) as {
        projectId?: string;
      };
      if (ctx.projectId) {
        const probe = await fetch(
          `${DEPLOY_API_URL}/projects/${ctx.projectId}/versions/latest`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        // 200 (has version) or 404 (new project, no versions yet) both mean the
        // project still exists and is owned by the current user.
        if (probe.ok || probe.status === 404) return ctx.projectId;
      }
    } catch {
      // fall through to fresh create
    }
  }
  return createE2eProject(token);
}

export default async function globalSetup(): Promise<void> {
  const token = (await reuseExistingToken()) ?? (await loginViaDeployApi());
  const projectId = await reuseOrCreateProject(token);

  const state = {
    cookies: [] as unknown[],
    origins: [
      {
        origin: DEPLOY_BASE_URL,
        localStorage: [
          { name: AUTH_TOKEN_LOCAL_STORAGE_KEY, value: token },
        ],
      },
    ],
  };

  fs.mkdirSync(path.dirname(STORAGE_STATE_PATH), { recursive: true });
  fs.writeFileSync(STORAGE_STATE_PATH, JSON.stringify(state, null, 2));

  writeE2eContext({ projectId });
}
