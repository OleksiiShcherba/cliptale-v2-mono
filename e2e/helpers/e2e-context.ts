/**
 * Shared access to the projectId + target baseUrl created by global-setup.
 *
 * Specs import `readE2eProjectId()` to navigate to
 * `/editor?projectId=<id>` so every test reuses the same empty project
 * — no repeated POST /projects, no accumulating state, no cross-test race.
 *
 * The stored `baseUrl` lets `global-setup` detect a stale context from
 * the other environment and rebuild it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export const E2E_CONTEXT_PATH = path.resolve(
  __dirname,
  '../../test-results/e2e-context.json',
);

export interface E2eContext {
  projectId: string;
  /** The base URL this projectId was created against (local vs deploy). */
  baseUrl: string;
}

export function writeE2eContext(ctx: E2eContext): void {
  fs.mkdirSync(path.dirname(E2E_CONTEXT_PATH), { recursive: true });
  fs.writeFileSync(E2E_CONTEXT_PATH, JSON.stringify(ctx, null, 2));
}

export function readE2eProjectId(): string {
  const raw = fs.readFileSync(E2E_CONTEXT_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as E2eContext;
  if (!parsed.projectId) {
    throw new Error(
      'E2E context is missing projectId — globalSetup likely failed.',
    );
  }
  return parsed.projectId;
}
