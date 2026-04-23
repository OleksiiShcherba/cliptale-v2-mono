---
name: 2026-04-22 batch (Storyboard Editor Part A) verification anchors
description: Post-batch invariants and regressions found during Guardian review of the first Storyboard Editor batch
type: project
---

2026-04-22 Storyboard Editor — Part A batch (Subtasks 1–8). Dev-log tail claims 102/102 storyboard suite pass, but Guardian verified two concrete regressions plus a documentation gap.

**Why:** this batch introduced four new migrations (031–034), a brand-new `/storyboards/:draftId` router, and the `features/storyboard/` FE slice. Catching these regressions here protects the next batch (Storyboard Editor Part B) because they compound quickly.

**How to apply:** next Guardian review should grep-verify these invariants before trusting dev-log claims.

## Confirmed regressions at batch close (all on uncommitted tree)

1. **storyboard_history LIMIT ? prepared-statement failure** — `apps/api/src/repositories/storyboard.repository.ts:108` and `:221` both pass `limit` as a `?` placeholder in `pool.execute()`. mysql2's prepared-statement protocol cannot bind LIMIT as a parameter; DB returns `ER_WRONG_ARGUMENTS` (errno 1210, `Incorrect arguments to mysqld_stmt_execute`). `GET/POST /storyboards/:draftId/history` return HTTP 500 in live API. Two integration tests fail (POST /history 201 and GET /history 200). Fix: inline sanitized number into SQL or switch from `execute` to `query` for those queries.

2. **@xyflow/react never installed in web-editor container** — declared in `apps/web-editor/package.json` but `/app/apps/web-editor/node_modules/@xyflow/react` and `/app/node_modules/@xyflow/react` both absent. Vite pre-transform fails on every storyboard component at runtime; two FE test files (SceneBlockNode.test.tsx, StoryboardPage.test.tsx) fail to load. Live deploy at `https://15-236-162-140.nip.io/storyboard/:draftId` is broken for clients. Fix: `npm install` inside web-editor container after rebuild, or a container rebuild in docker-compose.

3. **OpenAPI surface not updated** — `packages/api-contracts/src/openapi.ts` contains zero `/storyboards/:draftId` path entries. Violates CLAUDE.md §14 (PR requirements) and §9 (api-contracts is generated). The five new endpoints (GET, PUT, POST initialize, GET history, POST history) ship without OpenAPI documentation or generated-client coverage.

## Architecture compliance notes (clean)

- Layer discipline correct: `storyboard.routes.ts` → `storyboard.controller.ts` → `storyboard.service.ts` → `storyboard.repository.ts`; no SQL in services, no business logic in controller.
- Transaction boundary owned by service (`saveStoryboard` BEGIN/COMMIT/ROLLBACK); repo exposes `getConnection()` — same pattern as `version.repository.ts`.
- Ownership enforced in service `assertOwnership()` (NotFoundError for missing, ForbiddenError for cross-user).
- Routes register `/initialize` and `/history` BEFORE `/:draftId` — avoids Express param shadowing.
- Migration idempotency: all four use `CREATE TABLE IF NOT EXISTS`.
- `storyboard_edges` DB-level one-in/one-out via UNIQUE on source + target — matches service's full-replace PUT.
- FE store/history/autosave follow §7 state rules (`useSyncExternalStore` + hand-rolled store).
- File-length cap: `StoryboardPage.tsx` 322L (22 over, pragmatic exception documented in dev-log); `storyboardPageStyles.ts` 278L, `storyboard.repository.ts` 243L — all ≤ 300.

## Class A/C roster unchanged

Pre-existing `project_assets_current` dropped-table failures remain visible this batch in integration tests:
- `assets-finalize-endpoint.test.ts` (ER_NO_SUCH_TABLE)
- `assets-list-endpoint.test.ts` (ER_NO_SUCH_TABLE)
- `versions-list-restore-endpoint.test.ts` (DEV_AUTH_BYPASS user-mismatch: `dev-user-001` vs `user-test-001`)

These are Known Issues from the 2026-04-20 batch and are NOT regressions from this batch.

## Test totals (via docker compose exec)
- API: 1158 passed / 3 failed / 5 skipped / 2 todo (1175 total). 2 storyboard failures are new; 1 pre-existing.
- web-editor: 2314 passed / 2 test FILES failed to load (suite count short by 2). Storyboard hooks/store/ZoomToolbar/useAddBlock subfiles DO pass.
- media-worker: 143/143 pass.
- render-worker: 26/26 pass.

## Direction alignment

Aligned with `docs/general_idea.md` Evolution section: storyboard lives on `generation_drafts.id` as canonical ID (matches "Storyboard drafts" subsection). New `storyboard_block_media` pivot references `files.file_id` — consistent with Files-as-Root.
