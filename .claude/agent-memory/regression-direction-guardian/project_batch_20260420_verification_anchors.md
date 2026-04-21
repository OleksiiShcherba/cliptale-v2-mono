---
name: 2026-04-20 backlog batch (Issues 1-6, 18 subtasks) verification anchors
description: Migrations 028/029/030 landed live; A3 hook broke App.*.test.tsx mocks; split A3 tests fail to load; thumbnail adapter still hard-nulls; batch mostly uncommitted
type: project
---

2026-04-20 backlog batch (EPICs A–F, 18 subtasks) — independently-verifiable post-batch state:

**Why:** Future guardian reviews against this batch need grep-verifiable anchors so they can tell what this batch left behind vs. what a subsequent batch should have changed.

**How to apply:** Before approving follow-up work that claims to fix anything from Issues 1-6, verify these anchors still hold (or correctly moved):

**Live DB invariants (verified via `docker compose exec db mysql … DESCRIBE`):**
- `schema_migrations` rows include `028_user_project_ui_state.sql`, `029_soft_delete_columns.sql`, `030_files_thumbnail_uri.sql` (applied 2026-04-20 12:16–13:14).
- Tables present: `user_project_ui_state` (composite PK user_id+project_id, state_json JSON, updated_at DATETIME(3)).
- `deleted_at DATETIME(3) NULL` columns on: `files`, `projects`, `generation_drafts`, `project_files`, `draft_files`.
- `files.thumbnail_uri VARCHAR(1024) NULL` exists.

**Runtime test counts (sampled 2026-04-20 15:52):**
- api: 1066 passed / 1 failed / 5 skipped / 2 todo out of 1081 tests across 112 files; 4 suites failed-to-load (3 pre-existing schema drift + 1 NEW regression in `asset.response.service.test.ts`).
- media-worker: 143/143 passed.
- web-editor full: 2068 passed / 70 failed out of 2138 tests across 191 files; 9 test files failed.
- web-editor targeted new surfaces (shared/undo + shared/asset-detail + features/trash): 72/72.
- web-editor targeted E2/E3/F1: 54/54.

**Confirmed regressions in this batch (each has a Recommendations-numbered fix):**
1. `useProjectUiState.{restore,debounce,flush,project-switch}.test.ts` — ReferenceError at module load; `vi.hoisted()` references imports from `./useProjectUiState.fixtures.ts`. Hook code works, but zero executable test coverage on A3.
2. `App.test.tsx` + 4 siblings mock `@/store/ephemeral-store` with only `useEphemeralStore + setSelectedClips` — missing `subscribe/getSnapshot/setAll` that A3's hook now imports. 60+ App tests error at runtime with `No "subscribe" export is defined on the mock`.
3. `asset.response.service.test.ts` fails to load — B3 added `import file.repository from asset.service.ts`, which reads `config.db.host` at module init. The test's `vi.mock('@/config.js', …)` exposes only `config.s3`.

**Latent bug (flag if thumbnails claim green):** `asset.repository.ts:111` hard-codes `thumbnailUri: null` in `mapRowToAsset`. The thumbnail endpoint (`GET /assets/:id/thumbnail`) goes `streamThumbnail → asset.service.getAsset → asset.repository.getAssetById` which returns null thumbnail unconditionally. C3's project-card thumbnails work because the controller builds the proxy URL from `thumbnailFileId` directly, but the endpoint itself will 404 even when `files.thumbnail_uri` is populated.

**Half-implemented contract:** `/trash` issues `nextCursor` but `trashQuerySchema` has no `cursor` param; `file.repository.trash.listSoftDeletedByUser` has no cursor arg. Pagination broken past page 1.

**Commit integrity red flag:** Only 4 of 18 subtasks are commits on any branch: 3c6fcb4 (E1), 099f969 (D1 fontWeight), b912d59 (D1 panel move), 688723d (cleanup). All of A1/A2/A3/B1-B5/C1-C3/D2/E2/E3/F1 live as uncommitted working-tree modifications and untracked files on `feat/f1-ai-panel-fluid-width`. Feature branches `feat/a1…` through `feat/e3…` all point to `20e159c` or earlier — reviewer verdicts on those subtasks were rendered against an unversioned snapshot.

**Stale-test debt (NOT regressions of this batch, but still failing):**
- `assets-finalize-endpoint.test.ts:68,86` and `assets-list-endpoint.test.ts:76,96` still INSERT into dropped `project_assets_current`. 688723d cleanup missed them.
- `versions-list-restore-endpoint.test.ts:151` — DEV_AUTH_BYPASS user-mismatch (Class A, known).

**Architectural acknowledgments landed:**
- Track/clip deletes remain ProjectDoc patches (Ctrl+Z only) — NOT pushed to server-soft-delete model per Issue #2 literal reading.
- Hard-purge job for 30-day TTL rows not implemented — soft-deleted rows accumulate forever.
