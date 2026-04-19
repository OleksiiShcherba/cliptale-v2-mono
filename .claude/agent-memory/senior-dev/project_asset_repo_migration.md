---
name: Asset Repository Migration (Files-as-Root Batch 3)
description: Backend Repository Migration batch — ALL 5 SUBTASKS COMPLETE (2026-04-19)
type: project
---

Migrated asset.repository + generationDraft.repository + 2 blocked test suites to the Files-as-Root schema.

**Why:** Guardian Report 2026-04-19 found asset.repository.ts still querying the dropped `project_assets_current` table (8 queries), causing 100% API failure. Two integration suites blocked at beforeAll.

**ALL SUBTASKS COMPLETE (2026-04-19)**

**Subtask 5 — COMPLETE (2026-04-19):**
Full regression run result: **886 pass | 7 fail | 4 skip** (90 test files, 82 pass, 7 fail, 1 skipped).
- Class B (schema drift): ZERO — target achieved
- Class C patched suites: ZERO failures — `assets-patch-endpoint.test.ts` (9/9), `generation-drafts-cards.endpoint.test.ts` (7/7), `generation-drafts-cards.shape.test.ts` (5/5)
- Class A remaining (2 tests, pre-existing DEV_AUTH_BYPASS): `renders-endpoint.test.ts`, `versions-list-restore-endpoint.test.ts`
- Class C remaining (5 tests, pre-existing stale seed): `assets-finalize-endpoint.test.ts`, `assets-list-endpoint.test.ts`, `assets-stream-endpoint.test.ts`, `assets-delete-endpoint.test.ts`, `assets-endpoints.test.ts`
- Subtask 6 count discrepancy reconciled: 834 claim was wrong (blocked 12-test suite not yet patched at time of run); true baseline was 822 → now 886

**Key facts for future sessions:**
- `asset.repository.ts` is now a thin compat adapter over `file.repository.ts` + `fileLinks.repository.ts`
- `project_assets_current` references in `.ts` files are all comments/migration-test historical refs — zero live SQL
- 5 Class C test files still seed `project_assets_current`; queued for next migration batch
- `files.user_id` is a FK to `users(user_id)` — always INSERT user row before seeding files for a new user_id

**How to apply:** Batch-3 is complete. Next: migrate remaining 5 Class C test files (`assets-finalize`, `assets-list`, `assets-stream`, `assets-delete`, `assets-endpoints`) to Files-as-Root seed pattern — same approach as Subtasks 3-4.
