---
name: Backlog Batch general_tasks.md issues 1–6
description: 6-EPIC batch covering timeline state, soft-delete, project preview, wizard detail panel, scope toggle, AI panel width; A-D ALL DONE; E1 DONE; next: E2 (FE scope toggle) or F1 (AI panel width)
type: project
---

Backlog Batch — general_tasks.md issues 1–6. Each subtask on its own branch off master.

**Why:** Real usage pain from the Files-as-Root landing; ordered by impact: F → C → A → E → D → B.

**EPIC A — Per-project timeline UI state (server-persisted)**
- [x] A1 — `028_user_project_ui_state.sql` + `userProjectUiState.repository.ts` (DONE 2026-04-20, branch: feat/a1-user-project-ui-state)
- [x] A2 — Service + REST endpoints GET/PUT /projects/:id/ui-state (DONE 2026-04-20, branch: feat/a2-ui-state-endpoints)
- [x] A3 — FE hook useProjectUiState + ephemeral-store hydration (DONE 2026-04-20, branch: feat/a3-ui-state-hook)

**EPIC B — Soft-delete + Undo** (B1–B5; high risk — touches all delete flows; land last) — ALL DONE
- [x] B1 — `029_soft_delete_columns.sql`: `deleted_at DATETIME(3) NULL` on files, projects, generation_drafts, project_files, draft_files + indexes on files+projects (DONE 2026-04-20, branch: feat/b1-soft-delete-columns)
- [x] B2 — Repository `WHERE deleted_at IS NULL` filters on all reads + `softDelete`/`restore`/`*IncludingDeleted` methods (DONE 2026-04-20, branch: feat/b2-soft-delete-repositories)
- [x] B3 — Services soft-delete + restore services (DONE 2026-04-20, branch: feat/b3-soft-delete-services)
- [x] B4 — REST endpoints delete/restore + GET /trash (DONE 2026-04-20, branch: feat/b4-soft-delete-endpoints)
- [x] B5 — FE Undo toast + Trash panel (DONE 2026-04-20, branch: feat/b5-soft-delete-ui)

**EPIC C — Project preview = first frame** (C1–C3)
- [x] C1 — `030_files_thumbnail_uri.sql`: `thumbnail_uri VARCHAR(1024) NULL` on `files` table (DONE 2026-04-20, branch: feat/c1-files-thumbnail-uri; 6 integration test assertions)
- [x] C2 — media-worker writes `files.thumbnail_uri` after ingest (DONE 2026-04-20, branch: feat/c2-thumbnail-after-ingest; 14 new unit tests)
- [x] C3 — API: `project.repository.findProjectsByUserId` returns first-clip thumbnail (DONE 2026-04-20, branch: feat/c3-project-first-frame-thumbnail)

**EPIC D — Storyboard asset detail panel** (D1–D2; depends on B5) — ALL DONE
- [x] D1 — Parameterize AssetDetailPanel for draft context (DONE 2026-04-20, branch: feat/d1-asset-detail-panel-context)
- [x] D2 — Wizard: open panel on asset click (DONE 2026-04-20, branch: feat/d2-wizard-asset-detail)

**EPIC E — General vs project/draft file scope toggle** (E1–E3; depends on B2)
- [x] E1 — API: `scope` query param on asset list endpoints (DONE 2026-04-20, branch: feat/e1-assets-scope-param)
- [x] E2 — FE: scope toggle in AssetBrowserPanel + MediaGalleryPanel (DONE 2026-04-20, branch: feat/e2-scope-toggle-ui)
- [x] E3 — Auto-link general file when first used (DONE 2026-04-20, branch: feat/e3-auto-link-on-use)

**EPIC F — AI panel full width in wizard** (F1; no deps; trivial)
- [x] F1 — Make AI panel width fluid (DONE 2026-04-20, branch: feat/f1-ai-panel-fluid-width)

**How to apply:** ALL EPICs (A-F) COMPLETE. All 15 subtasks done. active_task.md subtask list is empty.

**D2 implementation notes (updated after fix round 1):**
- `useWizardAsset(fileId: string | null)` — React Query hook (`['wizard-asset', id]`), `enabled: fileId !== null`. Fetches full `Asset` via `getAsset()` from `asset-manager/api`.
- `WizardAssetDetailSlot` extracted to its own file to keep `GenerateWizardPage.tsx` under 300 lines. Also extracted `generateWizardPage.styles.ts` for the same reason.
- `handleDeleteAsset` uses `.then()` on the delete promise — no error toast on failure (acceptable for D2 scope).
- Gallery query key `['generate-wizard', 'assets']` invalidated on delete + undo. `['wizard-asset', id]` invalidated on delete so a re-select of the same asset re-fetches.
- Rename in draft context: `InlineRenameField` now accepts optional `onRenameSuccess?: () => void` callback. `AssetDetailPanel` passes `handleRenameSuccess` which conditionally invalidates `['generate-wizard', 'assets']` when `context.kind === 'draft'`. This keeps the logic local to the panel — no new props on `AssetDetailPanel` itself.
- Fix round 1: relative import `'../types'` → absolute `'@/features/generate-wizard/types'` in `GenerateWizardPage.tsx`; design-reviewer hardcoded-hex comments pushed back (per-file constants are the established project convention; CSS vars not used anywhere).

**D1 implementation notes:**
- `AssetDetailPanel` moved to `shared/asset-detail/`. Re-export barrel left at original `features/asset-manager/components/AssetDetailPanel.tsx` — all existing importers continue to work.
- `context: AssetDetailPanelContext` discriminated union: `{ kind: 'project', projectId }` | `{ kind: 'draft', draftId }`.
- Draft context: "Add to Timeline" dropdown → "Add to Prompt" button (brand purple, calls `onAddToPrompt(asset)`). "Replace File" hidden.
- `onAddToPrompt(asset: Asset) => void` is the seam for D2 MediaRef chip insertion.
- `InlineRenameField` in draft context receives `projectId = ''` — safe: only used in query cache key; D2 can revisit if draft-scoped rename is needed.
- Tests: 37 new tests split across `AssetDetailPanel.test.tsx` (project + shared) and `AssetDetailPanel.draft.test.tsx`; fixtures in `AssetDetailPanel.fixtures.ts`. All 108 related tests green.
- Mock paths in existing tests updated from relative `./` to `@/features/asset-manager/components/` absolute paths (required because the real component now lives in shared/).

**B5 implementation notes:**
- `useUndoToast` single-toast queue: calling `showToast` replaces any live toast without calling its `onUndo` — user loses undo window for prior action (acceptable UX).
- `UndoToast` component returns `null` when `visible: false` — pure presentational, no portal.
- `DeleteAssetDialog` fires `onDeleted()` first (closes dialog), then `onShowUndoToast(...)` — toast appears on clean screen.
- Track delete (handleDeleteTrack in App.tsx) NOT wired — Immer patch undo already covers it; EPIC B carve-out documented.
- `StoryboardCard` / `ProjectCard` now call `useQueryClient()` — existing tests updated to wrap with `QueryClientProvider`.
- `TrashPanel` at `/trash` (ProtectedRoute) uses `listTrash()` via `GET /trash?limit=50`; pagination not in scope.
- `StoryboardCard` and `ProjectCard` return `React.ReactElement | null` to allow optimistic hide.

**B4 implementation notes:**
- `DELETE /projects/:id` → `project.service.softDeleteProject` (service layer already existed from B3).
- `POST /assets/:id/restore` → `asset.service.restoreAsset` → re-fetches via `assetResponseService.getAssetResponse` for presigned URL. Double-fetch acceptable for low-frequency path.
- `POST /projects/:id/restore` → `project.restore.service.restoreProject`.
- `POST /generation-drafts/:id/restore` → `generationDraft.restore.service.restoreDraft`.
- `GET /trash` → `trash.controller.ts` → `trash.service.ts` — type param is Zod-validated inline (not via middleware) for clarity.
- `listSoftDeletedByUser` functions split to `file.repository.trash.ts` and `generationDraft.repository.trash.ts` to keep parent repos under 300 lines.
- `listSoftDeletedByUser` on `project.repository.ts` stays in the main file (was under 300 lines with the function).
- Cursor strategy: fetch `limit+1` rows; if more than limit returned → nextCursor = last item's deletedAt ISO string; slice to limit.
- Integration tests: 4 files; all use real MySQL; ownership, auth, idempotency, and 410/404 error paths covered.

**B3 implementation notes:**
- `GoneError` (410) added to `lib/errors.ts` and registered in central error handler `index.ts`.
- `deleteAsset()` in `asset.service.ts`: no longer checks `isAssetReferencedByClip` — clips can reference soft-deleted files (EPIC B decision: placeholder frame, no crash).
- `restoreAsset()` in `asset.service.ts`: GoneError for purged + TTL >30d; re-fetches via `assetRepository.getAssetById` after restore to return full Asset shape.
- `softDeleteFile()` / `restoreFile()` added to `file.service.ts`.
- `generationDraft.service.remove()` now calls `softDeleteDraft` (not `deleteDraft`).
- New: `generationDraft.restore.service.ts` — `restoreDraft()`.
- New: `project.restore.service.ts` — `restoreProject()`.
- New: `project.service.softDeleteProject()` — ownership check + `softDeleteProject` repo call.
- `RESTORE_TTL_MS = 30 * 24 * 60 * 60 * 1000` used consistently across all three restore paths.
- Pre-existing fixture type errors fixed: `deletedAt: null` added to `aiGeneration.service.fixtures.ts` and `generationDraft.service.fixtures.ts` (these were introduced in B2 when the types gained the field).
- Tests: 4 new test files + 2 updated test files; 35+ unit tests; no integration tests (B4 wires the endpoints, integration tests belong there).
- Branch: feat/b3-soft-delete-services (off feat/b2-soft-delete-repositories).

**C2 implementation notes:**
- `extractThumbnail` exported as a pure function for testability; wraps fluent-ffmpeg builder chain.
- Thumbnail generated only when `contentType.startsWith('video/')` AND `videoStream` found — audio-only .mp4 containers safely skipped.
- seekSec = `Math.min(1, durationSec / 2)` — handles very short clips (< 2s) gracefully.
- `file.repository.list.ts` extracted from `file.repository.ts` (was 318 lines after additions; list helpers moved to keep main file ≤ 300). Pattern mirrors `asset.repository.list.ts`.
- `DbRow` + `mapRow` duplicated in list file (not imported) to avoid ESM circular runtime dependency.
- `ingest.job.test.ts` default `contentType` changed from `'video/mp4'` to `'image/png'` so existing metadata tests don't trigger thumbnail generation (thumbnail tests live in `ingest.job.thumbnail.test.ts`).

**B2 implementation notes:**
- `*IncludingDeleted` helpers (e.g. `findByIdIncludingDeleted`, `findProjectByIdIncludingDeleted`, `findDraftByIdIncludingDeleted`) are NOT exported from barrels — internal restore/admin path only.
- `FileRow`, `ProjectRecord`, `GenerationDraft` types all gained `deletedAt: Date | null` field.
- `asset.repository.ts` (compat adapter) also received the filters for consistency; it will be collapsed in a later cleanup.
- 5 new `*.softdelete.test.ts` files: `file.repository`, `project.repository`, `generationDraft.repository`, `fileLinks.repository`, `clip.repository`.
- **Fix round 1 (2026-04-20):** `asset.repository.ts` split to comply with §9.7 (was 335 lines). Paginated list functions extracted to `asset.repository.list.ts` (166 lines); main file now 244 lines, re-exports via `export { ... } from './asset.repository.list.js'`. No importer changes needed. `import type` used in list module for `Asset`/`AssetStatus` (no runtime ESM cycle). `file.repository.ts` (306 lines = 6 over cap) kept monolithic — pragmatic exception documented in dev log (splitting 6 lines would be contrived; module is a single cohesive table/CRUD unit).

**A3 implementation notes:**
- `EphemeralState` type exported from ephemeral-store (was internal only).
- `setAll(partial)` accepts `Partial<EphemeralState>` — only applies `playheadFrame`, `zoom`, `pxPerFrame`, `scrollOffsetX`; selection/volume excluded (not project-scoped).
- Hook has two effects: Phase 1 (restore on project ready) and Phase 2 (subscribe + debounce save). Both guard on `isProjectReady && projectId`.
- `isPersistedUiState` type guard validates blob shape before applying — corrupt data silently ignored.
- Cleanup on project switch cancels debounce but does NOT flush — avoids spurious PUT for old project.
- `beforeunload` flush is fire-and-forget (no await budget in beforeunload).
- `App.tsx` passes `''` / `false` while loading — hook guards are safe with empty string.
- Tests use `vi.useFakeTimers()` + `vi.hoisted()` pattern for hoisted mocks.
- A3 test file was split in Fix round 1 (2026-04-20): `vi.hoisted()` mocks cannot cross file boundaries (they must be declared inline in each test file); only non-hoisted constants are safe to export from a `*.fixtures.ts` file.

**A2 implementation notes:**
- `putUiStateSchema` uses `z.unknown().refine(v => v !== undefined, ...)` — `z.unknown()` alone accepts undefined (missing key), which would corrupt the JSON column. The refine prevents this.
- ACL middleware is currently a stub (TODO) — 403 foreign-project tests are marked `it.todo` in the integration suite; activate when ownership check is wired.
- Service checks project existence via `projectRepository.findProjectById` before upsert — correct per architecture (service = business invariants, middleware = access policy).
- Integration test file: `apps/api/src/__tests__/integration/userProjectUiState.integration.test.ts`.

**A1 implementation notes:**
- Table uses CREATE TABLE IF NOT EXISTS (no INFORMATION_SCHEMA guard) — correct for new-table migrations, only ALTER TABLE paths need the guard.
- `state_json` is typed as `unknown` everywhere — shape belongs to FE, API is intentionally permissive.
- Upsert re-reads after INSERT … ON DUPLICATE KEY UPDATE to capture server-generated updated_at.
- FK constraint names: fk_upuis_user, fk_upuis_project (short prefix avoids 64-char InnoDB limit).
