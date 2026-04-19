---
name: Batch-3 verification anchors (Backend Repository Migration to Files-as-Root)
description: Post-batch invariants that future reviews can grep-verify directly; records contract narrowings the adapter introduces
type: project
---

Batch-3 (2026-04-19) migrated `asset.repository.ts` and `generationDraft.repository.findAssetPreviewsByIds` to the `files` + `project_files` schema while preserving the legacy `Asset` public type.

**Why:** The repository layer had to be migrated before any service-level consumers could be collapsed; this batch gave us a "thin compat adapter" with zero call-site changes. All 5 subtask reviewer gates closed; acceptance was `886 pass | 7 fail | 4 skip`.

**How to apply** — future reviews should grep-verify these invariants:

1. **Zero live SQL against the dropped table:** `grep "INTO project_assets_current\|FROM project_assets_current" apps/api/src/repositories/ apps/api/src/services/ = 0`. Only migration files + migration-history tests + the 5 documented Class C integration tests legitimately retain the string.

2. **Class C roster (still-pending stale-seed debt, explicitly queued for a follow-up batch, not a Batch-3 regression):**
   - `assets-finalize-endpoint.test.ts`
   - `assets-list-endpoint.test.ts`
   - `assets-stream-endpoint.test.ts`
   - `assets-delete-endpoint.test.ts`
   - `assets-endpoints.test.ts`
   These still INSERT into `project_assets_current` in beforeAll. They will all fail with `ER_NO_SUCH_TABLE` until patched the same way `assets-patch-endpoint.test.ts` was in Subtask 3.

3. **Class A roster (pre-existing DEV_AUTH_BYPASS user mismatch, unrelated to Batch-3):**
   - `renders-endpoint.test.ts` — expects JWT user `user-test-001`, bypass gives `dev-user-001`
   - `versions-list-restore-endpoint.test.ts` — same root cause

4. **Adapter contract narrowings** (intentional, documented):
   - `Asset.fps` is now **always null** — `files` has no fps column. Consequence: `asset.response.service.ts` computes `durationSeconds` as `durationFrames / fps` and will return `null` for every asset served via this path until thumbnail/fps backfill lands.
   - `Asset.thumbnailUri` is always null — FE renders fallback.
   - `Asset.waveformJson` is always null — FE renders empty waveform.
   - `Asset.filename` falls back to `display_name ?? file_id` (no separate filename column on `files`).
   - `Asset.projectId` is `''` (empty string) when the file has no `project_files` pivot row.
   These are the price of keeping the adapter drop-in compatible; a future collapse-into-`file.repository` batch will remove the adapter entirely.

5. **§9 300-line cap status on Batch-3 files:**
   - `generation-drafts-cards.endpoint.test.ts` 273L ✓
   - `generation-drafts-cards.shape.test.ts` 248L ✓
   - `generation-drafts-cards.fixtures.ts` 26L ✓
   - `asset.repository.ts` **335L ✗** — exceeds by 35 lines. Not on the architecture-rules.md `fal-models.ts` exception list. Candidate for splitting (e.g. extract `findReadyForUser`/`getReadyTotalsForUser` + types into `asset.repository.list.ts`), OR for formal exception documentation, OR for resolving-by-deletion when the adapter is collapsed.

6. **Dot-infix split convention** — Subtask 4 renamed `generation-drafts-cards-endpoint.test.ts` → `generation-drafts-cards.endpoint.test.ts` and introduced `.shape.test.ts` + `.fixtures.ts`. This is the canonical pattern; `vi.mock()` + env-setup must still be duplicated per Vitest hoisting.

7. **Total test counts (baseline before Batch-4):**
   - apps/api: 886 pass / 7 fail / 4 skip (82/7/1 files)
   - apps/media-worker: 136/136 (14 files)
   - apps/web-editor: 2006/2006 (178 files)
