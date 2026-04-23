---
name: 2026-04-23 Guardian Recommendations Batch verification anchors
description: Cleanup batch closing Guardian recs from prior run — Class C stale seeds fixed, DEV_AUTH_BYPASS assertion fixed, stub deleted, Playwright canvas spec added, vitest-docker docs added, full Storyboard Part A committed as `feat/storyboard-part-a` 7a083a3
type: project
---

Batch-close state captured on commit `7a083a3` (on local branch `feat/storyboard-part-a`; NOT pushed to `origin`).

**Test state (all docker-compose-exec'd with `-w /app/apps/<pkg>`):**
- apps/api: 1168 pass / 0 fail / 5 skip / 2 todo (116 files + 2 skipped = 118)
- apps/web-editor: 2362 pass / 0 fail (208 files) — 238s wall-clock
- apps/media-worker: 143 pass / 0 fail (15 files)
- apps/render-worker: 26 pass / 0 fail (3 files)
- packages/api-contracts: 40 pass / 0 fail (3 files)
- Total: 3739 passing / 0 failing.

**Subtask-specific anchors:**
- Subtask 1 (Class C seed fix): `apps/api/src/__tests__/integration/assets-finalize-endpoint.test.ts` + `assets-list-endpoint.test.ts` — switched INSERTs from `project_assets_current` (dropped) to `files` + `project_files`; user=`dev-user-001`; teardown FK-safe (project_files → files → projects). 7/7 pass.
- Subtask 2 (DEV_AUTH_BYPASS assertion): `versions-list-restore-endpoint.test.ts:151` line change exactly `'user-test-001' → 'dev-user-001'`. 10/10 pass. Test sets `APP_DEV_AUTH_BYPASS: 'true'` which overrides JWT sub. Pattern: any assertion on user-id from authenticated identity must expect `dev-user-001`.
- Subtask 3 (stub delete): `apps/web-editor/src/features/storyboard/store/storyboard-history-store.stub.ts` GONE. Remaining files in dir = `storyboard-history-store.ts`, `storyboard-history-store.test.ts`, `storyboard-store.ts`. Comment in `storyboard-history-store.ts:21` retained (documents contract).
- Subtask 4 (Playwright canvas spec): `e2e/storyboard-canvas.spec.ts` (427L) — 5 tests; uses `installCorsWorkaround()` two-route pattern (auth/me fulfill + storyboards/* proxy via page.request.fetch) on deployed instance; `IS_LOCAL_TARGET` guard no-ops on localhost. +`CanvasToolbar.test.tsx` 11 unit tests (qa-reviewer insisted on unit coverage).
- Subtask 5 (commit): branch `feat/storyboard-part-a` @ `7a083a3` from `origin/master@0a0e80d`; 63 files, 8855 insertions; excluded playwright-report, agent-memory, lust-not-compacted backup. **Local only, not pushed.**
- Subtask 6 (vitest-docker docs): `docs/architecture-rules.md` §10 at line 698 "#### Running Vitest inside Docker containers" with `-w /app/apps/<pkg>` examples for api, web-editor, api-contracts.

**Known-Issues list staleness discovered (compacted log):** "Class A (pre-existing DEV_AUTH_BYPASS / dropped-table refs still active): `renders-endpoint.test.ts`" is WRONG. Verified 10/10 pass. Whoever curates the Known Issues list is behind current repo state.

**Deploy-config regression risk (pre-existing, unfixed):**
- `docker-compose.yml:79` bundles `VITE_PUBLIC_API_BASE_URL=http://localhost:3001` into the web-editor build
- `docker-compose.yml:57` hardcodes `APP_CORS_ORIGIN=http://localhost:5173` on the API
- Deploy serves `https://15-236-162-140.nip.io` → browser origin rejected by CORS AND API base URL unreachable
- The Subtask-4 E2E "CORS workaround" (page.route intercept + page.request.fetch proxy) papers over this — it does NOT fix production. Real clients hitting the deployed instance likely cannot use storyboard features at all.

**§9.7 soft violation (tests):** `e2e/storyboard-canvas.spec.ts` 427L, `e2e/storyboard-history-regression.spec.ts` 329L — both over 300L cap; rules §9.7 does not explicitly exempt E2E specs but the project has traditionally tolerated long E2E files (StoryboardPage.tsx 322L already listed as approved exception).
