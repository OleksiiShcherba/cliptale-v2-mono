---
name: Project: Guardian Recommendations Batch 3 (2026-04-23)
description: Guardian P2-P4 follow-up batch after Storyboard Part A; 6 subtasks; Subtask 1 complete
type: project
---

Batch of 6 subtasks addressing Guardian recommendations after Storyboard Part A.

**Why:** Guardian returned HEALTHY but with 5 P2-P4 recommendations to clean up test seeds, fix a DEV_AUTH_BYPASS assertion, remove dead code, add E2E coverage, commit accumulated work, and document a vitest gotcha.

**Status as of 2026-04-23:**
- Subtask 1 (Fix Class C stale test seeds) — COMPLETE. assets-finalize + assets-list tests now seed into `files` + `project_files`. 7/7 pass.
- Subtask 2 (Fix DEV_AUTH_BYPASS assertion in versions-list-restore) — COMPLETE. Changed `'user-test-001'` → `'dev-user-001'` on line 151. Full suite 1168 pass / 0 fail.
- Subtask 3 (Delete storyboard-history-store.stub.ts) — COMPLETE. Grep confirmed only a comment reference; deleted file; 207 test files / 2351 tests pass.
- Subtask 4 (Playwright E2E for /storyboard page) — COMPLETE. e2e/storyboard-canvas.spec.ts (5 tests, 5/5 passed)
- Subtask 5 (Commit full batch to git) — COMPLETE. Branch `feat/storyboard-part-a` created from origin/master; 63 files staged; commit `7a083a3`.
- Subtask 6 (Document docker compose exec vitest gotcha) — COMPLETE. Added §10 Testing subsection "Running Vitest inside Docker containers" to docs/architecture-rules.md at lines 698-713.

**Key findings from Subtask 1:**
- `dev-user-001` always exists in the test DB (auth middleware fixture); never INSERT or DELETE it in seeds
- `project_files.project_id` has a real FK to `projects` — must seed a `projects` row before inserting into `project_files`
- `GET /projects/:id/assets` returns paginated envelope `{ items, nextCursor, totals }` not a flat array
- `AssetApiResponse` wire field is `id` (not `fileId`) for the asset identifier
- `afterAll` teardown order: `project_files` → `files` → `projects` (FK RESTRICT on file side)

**How to apply:** When seeding integration tests against the new schema, always seed users → projects → files → project_files in that order, and tear down in reverse.

**Key findings from Subtask 4 (Playwright storyboard canvas):**
- CORS issue: Vite dev server bundles VITE_PUBLIC_API_BASE_URL=http://localhost:3001; API CORS allowlist only permits http://localhost:5173. Browser at https://15-236-162-140.nip.io gets CORS-blocked.
- page.route() intercept works but Playwright still applies CORS checks on fulfilled responses. MUST set `access-control-allow-origin: *` in the route.fulfill() headers to bypass browser CORS on the proxy response.
- Two-interceptor pattern: (1) `**/auth/me` — mock with dev-user payload; (2) `http://localhost:3001/storyboards/**` — proxy via page.request.fetch() with permissive CORS headers.
- IS_LOCAL_TARGET guard makes interceptors no-ops on localhost runs.
- Key testid selectors: start-node, end-node, storyboard-canvas, .react-flow, canvas-toolbar, add-block-button, zoom-toolbar, zoom-label, scene-block-node, scene-name, storyboard-page, storyboard-sidebar, back-button, next-step3-button
