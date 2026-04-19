---
name: Workspace and Test Discovery
description: How vitest/turbo discover and execute tests; gotchas with directories outside registered packages
type: project
---

## Only registered turbo workspaces run tests in CI

The monorepo uses Turbo to orchestrate tests across packages. Only directories with a `package.json` at the root are registered as workspaces in the project.

**Registered workspaces:** `packages/*`, `apps/*`

**Unregistered directories:** `infra/`, `docs/`, `scripts/` — these have no package.json and will never run tests via `turbo run test`

**Impact:** If a test file is placed in an unregistered directory (e.g., `infra/s3/cors.test.ts`), it will never be discovered or executed, even if the test file itself is valid. The developer must either:
1. Create a `package.json` at the directory root and register it in `turbo.json` as a workspace, OR
2. Move the test into an existing registered workspace (e.g., move `cors.test.ts` into `apps/api/src/infra/s3/`)

**Why:** Turbo only discovers packages with explicit `package.json` + entry in `turbo.json` `workspaces` or implicit glob patterns.

**Discovery method:** Vitest is configured per-package in each workspace's `vitest.config.ts` or `vite.config.ts`. Root-level `npx vitest run` from the monorepo root will fail to resolve the alias configs and cannot execute tests for files outside recognized packages.

**Example from Subtask 6 (2026-04-19):** Test file `infra/s3/cors.test.ts` was created with sound assertions but placed in an unregistered directory. Result: test will never run in CI.

---

## How to verify a test is wired into the workspace

Before creating a test file, ensure the directory has:
1. A `package.json` with a `"test"` script entry (typically `"test": "vitest run"`)
2. A `vitest.config.ts` or reliance on `vite.config.ts` for Vitest config
3. The package is discoverable by Turbo (either listed in `turbo.json` workspace glob or has implicit patterns like `apps/*`)

If any of these are missing, the test file will be created but orphaned — visible on disk but never executed.
