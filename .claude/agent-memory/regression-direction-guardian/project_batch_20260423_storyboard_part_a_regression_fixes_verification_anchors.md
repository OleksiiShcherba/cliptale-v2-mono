---
name: 2026-04-23 batch — Storyboard Editor Part A Regression Fixes — verification anchors
description: Three-subtask regression-fix batch closed all three bugs Guardian opened on Part A; full FE suite green; one new Class C pre-existing file surfaced (assets-finalize-endpoint.test.ts), but no new regressions from this batch
type: project
---

Batch scope — closes the three regressions Guardian flagged at the end of Storyboard Part A (2026-04-22). All work is uncommitted at report time.

**Fix 1 — mysql2 LIMIT binding (storyboard.repository.ts):**
- `pool.execute` → `pool.query` at lines 110 (`findHistoryByDraftId`) and 224 (`insertHistoryAndPrune` prune DELETE).
- Other 6 `pool.execute` sites correctly retained (they don't bind LIMIT).
- `storyboard.integration.test.ts` 12/12 green (inside `/app/apps/api` workdir); `storyboard.service.test.ts` 12/12 green.
- New E2E spec: `e2e/storyboard-history-regression.spec.ts` (329L, 4 tests: GET /history 200, POST /history 201, round-trip, browser-context endpoint calls) — does NOT try to navigate `/storyboard/:draftId` page, exercises API via `page.request` only. Correct choice given @xyflow page was still broken when spec was written.

**Fix 2 — @xyflow/react in web-editor container:**
- `apps/web-editor/package.json` has `"@xyflow/react": "^12.10.2"` in deps.
- Verified in container: `/app/node_modules/@xyflow/react/package.json` reports version `12.10.2` (hoisted by npm workspaces).
- `docker compose build web-editor` was the correct fix — `npm install` inside the running container is a dead-end because node_modules are baked into the image.
- Full web-editor suite 2351/2351 pass (207 files, 246s). `SceneBlockNode.test.tsx` (17) + `StoryboardPage.test.tsx` (20) + all 8 storyboard files (119 tests) green.

**Fix 3 — OpenAPI storyboard contract:**
- `packages/api-contracts/src/openapi.ts` grew +195 lines: 5 paths + 8 component schemas added under `/storyboards/...`.
  - Paths: POST /initialize, GET, PUT, GET /history, POST /history.
  - Schemas: `BlockMediaItem`, `StoryboardBlock`, `StoryboardEdge`, `StoryboardState`, `BlockInsert`, `EdgeInsert`, `SaveStoryboardBody`, `PushHistoryBody`, `StoryboardHistoryEntry`.
  - All paths carry `security: [{ bearerAuth: [] }]` + `tags: ['storyboard']`.
- Test split per §9.7: `openapi.storyboard.paths.test.ts` (219L, 31 tests) + `openapi.storyboard.schemas.test.ts` (121L, 18 tests). Original 330L combined file deleted.
- api-contracts test run: 89/89 pass across 5 files. Also wires `STORYBOARD_STYLES` into `packages/api-contracts/src/index.ts` barrel.

**Known-issues / Class C footprint observed at batch close (NOT regressions):**
- `docker compose exec api npx vitest run` at repo root cwd → ALL tests fail with `@/config.js Failed to load url` because Vitest resolves tsconfig from repo root not workspace. Must use `-w /app/apps/api`. Not a new issue; documented test-command gotcha.
- Running the full API suite (from apps/api workdir) reveals 3 failed files / 1 failed test (total 118 files, 1 failure + 4 error-level file-load failures):
  - `assets-finalize-endpoint.test.ts` — ER_NO_SUCH_TABLE `project_assets_current` (beforeAll/afterAll INSERT+DELETE against dropped migration-024 table). **Class C stale test debt, pre-existing.** Matches `project_stale_test_debt_hotspots.md` memory.
  - `assets-list-endpoint.test.ts` — same root cause, different beforeAll INSERT.
  - `versions-list-restore-endpoint.test.ts` — `expect(createdByUserId).toBe('user-test-001')` but got `'dev-user-001'`. Known Class A DEV_AUTH_BYPASS pollution, listed verbatim in dev-log Known Issues.
- `renders-endpoint.test.ts` was already in Class A list but was not re-run in this pass; likely still failing.
- dev log's Known Issue list still accurately names all three failing files.

**Batch-close repo state (useful for next guardian):**
- `apps/api/src/index.ts` `storyboardRouter` wired (`app.use(storyboardRouter)` after trashRouter).
- `apps/web-editor/src/main.tsx` has `/storyboard/:draftId` ProtectedRoute.
- `apps/web-editor/src/features/generate-wizard/components/WizardFooter.tsx` navigates to `/storyboard/${draftId}` when draftId set, else `/generate/road-map`. Two new WizardFooter tests cover both branches (Test 7 + 7b).
- 4 new migration files present (031–034) but DB migrate runner is in-process so they run on next API boot — not yet reflected in live schema necessarily. Guardian memory `project_migration_reliability.md` applies (live DB drifts from repo).
- `StoryboardPage.tsx` = 322L (22 over cap) — approved §9.7 exception, documented.
- `e2e/storyboard-history-regression.spec.ts` 329L — not subject to 300-line cap (E2E specs have their own norms) but large; 4 tests declared.

**Direction check:** Part A is 11 subtasks end-to-end (8 original + 3 regression fixes). All three regressions opened at Part A close are now closed. Aligned with general_tasks.md "Storyboard Editor — Step 2 / Part A: Backend + Canvas Foundation" and general_idea.md §"Storyboard drafts". No architecture pivot; no new concerns.

**Flags for next review iteration:**
- Full API suite still surfaces 3 failing files (Class A + Class C). Batch did not introduce them; consider a cleanup subtask to migrate `assets-finalize-endpoint.test.ts` and `assets-list-endpoint.test.ts` beforeAll seeds from `project_assets_current` → `files` + `project_files`.
- `storyboard-history-store.stub.ts` noted as safe-to-delete in dev-log Known Issues — verify in next cleanup.
- E2E regression spec cannot navigate `/storyboard/:draftId` page yet (spec pre-dates @xyflow container fix). After this batch, a follow-up E2E can drive the real storyboard UI.
