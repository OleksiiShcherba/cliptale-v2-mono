# Active Task

## Task
**Name:** Fix E2E failures + add storyboard E2E coverage (E2E-FIX)
**Source:** Telegram request 2026-04-25 — "розберись чому всі нові зміни не покриті end-to-end"
**Goal:** All 40 Playwright tests pass (currently 16 fail); new E2E tests cover the 5 storyboard fixes shipped on 2026-04-25.

---

## Context

### Why this task matters
The storyboard has been heavily patched today (sentinel durationS, UUID edge/block/media IDs, Edit Scene immediate save, mediaItems persistence). None of these fixes have E2E coverage. In parallel, 16 existing tests in app-shell.spec.ts, asset-manager.spec.ts, and preview.spec.ts fail because those specs lack the CORS workaround needed to run against the deployed HTTPS instance — the Vite app at `https://15-236-162-140.nip.io` calls `http://localhost:3001` (mixed content blocked by the browser) and has no auth/me interceptor.

### Relevant architecture constraints
- E2E specs live in `e2e/*.spec.ts`; `e2e/*.spec.ts` files are exempt from the 300-line cap (§9.7).
- No raw SQL in tests — API-level helpers (`createTempDraft`, `initializeDraft`, `cleanupDraft`) already exist in `storyboard-fixes.spec.ts` and must be reused or extracted.
- CORS workaround pattern: `page.route('**/auth/me', ...)` + `page.route('http://localhost:3001/**', ...)` using `page.request` as proxy. Already proven in `storyboard-fixes.spec.ts`.
- The Playwright run command for the deployed instance: `E2E_BASE_URL=https://15-236-162-140.nip.io E2E_API_URL=https://api.15-236-162-140.nip.io npx playwright test`.
- Tests run via: `docker compose exec -T -w /app web-editor npx playwright test --project=chromium` (with env vars set) OR from host.

### Related areas of the codebase
- `e2e/app-shell.spec.ts` (35L) — 2 failing tests; no CORS workaround; navigates to `/editor?projectId=...`
- `e2e/asset-manager.spec.ts` (101L) — 8 failing tests; no CORS workaround
- `e2e/preview.spec.ts` (66L) — 6 failing tests; no CORS workaround
- `e2e/storyboard-fixes.spec.ts` (721L) — 6 existing storyboard tests; has `installCorsWorkaround` that only proxies `/storyboards/**` and mocks `auth/me`
- `e2e/helpers/auth.ts`, `e2e/helpers/env.ts`, `e2e/helpers/e2e-context.ts` — existing helpers
- `e2e/global-setup.ts` — runs once; seeds auth token + projectId into storageState

### Reuse audit
- `installCorsWorkaround` in `storyboard-fixes.spec.ts` — proxies `http://localhost:3001/storyboards/**` + mocks `auth/me`; needs to be extracted and broadened to proxy ALL `http://localhost:3001/**` for the editor specs
- `createTempDraft`, `initializeDraft`, `cleanupDraft`, `waitForCanvas`, `readBearerToken` — all in `storyboard-fixes.spec.ts`; extract to `e2e/helpers/storyboard.ts` so new tests can reuse them without duplicating 100+ lines
- `E2E_API_URL`, `IS_LOCAL_TARGET` from `e2e/helpers/env.ts` — already available

---

## Subtasks

- [x] **E2E-FIX-3: Add storyboard E2E coverage for 2026-04-25 fixes** — COMPLETE

---

## Open Questions / Blockers

⚠️ **Test 8 (Edit Scene modal)**: The `data-testid` for the scene block node must match what's in `SceneBlockNode.tsx`. Verify before writing the test. The modal Save button must also be locatable — check `SceneModal.tsx` for the Save button's accessible name or testid.

⚠️ **Test 9 (mediaItem fileId)**: For reliable E2E, the test needs a valid `fileId` (a real file UUID in the DB). Options: (a) create a test file via `POST /files` or `POST /assets` API before the test, or (b) use a known seeded fileId from global-setup. The plan recommends option (a): make a direct API call to upload a small test file, get its fileId, then use that fileId in the mediaItem PUT. If file upload is complex, option (b) could seed a dummy UUID that the API accepts without FK check (check if `storyboard_block_media.file_id` has a FK constraint).

---

## Notes for the implementing agent
- **Navigation mode:** EXPLORE (no docs-claude/ roadmap).
- **Branch:** Cut fresh from `origin/master` as `fix/e2e-storyboard-coverage`.
- **Critical staging warning:** Working tree has unrelated uncommitted files (.claude/ memory files, playwright-report/, test-results/). NEVER stage with `git add .` or `git add -A`. Stage only explicitly named files.
- **Run E2E tests with env vars:** `E2E_BASE_URL=https://15-236-162-140.nip.io E2E_API_URL=https://api.15-236-162-140.nip.io npx playwright test --project=chromium` (from project root on host, or inside web-editor container with those vars set).
- **Stale storyboard-fixes.spec.ts helpers:** The `installCorsWorkaround`, `readBearerToken`, `createTempDraft`, `initializeDraft`, `cleanupDraft`, `waitForCanvas` functions must be extracted to helpers files in E2E-FIX-1 BEFORE adding new tests in E2E-FIX-3, to avoid 100+ lines of duplication.
- **data-testid for scene block:** Verify in `SceneBlockNode.tsx` — likely `data-testid="scene-block-node"`.
- **data-testid for Edit Scene modal Save button:** Check `SceneModal.tsx` for the Save button's `type="submit"` or accessible name.
- **mediaItem FK constraint:** Check migration for `storyboard_block_media.file_id` foreign key before deciding the Test 9 seeding strategy.
- **Relevant memory entries:**
  - `feedback_branch_from_master.md` — always `git fetch origin && git checkout -b <name> origin/master`
  - `feedback_task_workflow.md` — orchestrator → senior-dev → reviewers; never skip planner
  - `project_cliptale_deploy.md` — deployment at `15-236-162-140.nip.io`
- **Domain skills loaded:** Playwright E2E patterns applied throughout (no Remotion/Figma/Anthropic SDK).
- **Test runner (E2E):** From project root: `E2E_BASE_URL=https://15-236-162-140.nip.io E2E_API_URL=https://api.15-236-162-140.nip.io npx playwright test --project=chromium`
- **Test runner (unit):** `docker compose exec -T -w /app/apps/web-editor web-editor npx vitest run` (frontend); `docker compose exec -T -w /app/apps/api api npx vitest run` (API)

---
_Generated by task-planner skill — 2026-04-25_

---
**Status: Ready For Use By task-executor**
