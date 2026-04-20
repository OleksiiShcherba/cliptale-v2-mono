# Active Task

## Task
**Name:** Backlog Batch — `general_tasks.md` issues 1–6
**Source:** `docs/general_tasks.md` (all 6 items)
**Goal:** Resolve the six outstanding UX/data issues: per-project timeline state, system-wide soft-delete with Undo, project first-frame preview, storyboard asset detail panel, general-vs-scoped file toggle, and full-width AI generation block.

---

## Context

### Why this task matters
`general_tasks.md` captures real usage pain recorded by the user while exercising the product after the Files-as-Root batch landed (2026-04-18). Left unresolved, they compound: losing timeline state on project switch erodes trust in the editor; hard-deletes destroy user content irreversibly now that `files` is the single root; Home page preview placeholders make the product feel unfinished; the wizard lacks asset inspection parity with the editor; the implicit "general vs project" split is baked in but has no UI; and the AI block width bug limits the wizard's usefulness. These are the frictions blocking ClipTale from feeling like a complete editor.

### Relevant architecture constraints
- **Layered API:** routes → controllers → services → repositories. No SQL in services; no logic in controllers (`architecture-rules.md` §4, §5).
- **`config.ts` is the only env reader** in each app (§12).
- **Services throw typed errors** (`lib/errors.ts`); central handler maps them (§8).
- **Repositories return typed rows**; throw only on DB failure (§8).
- **Integration tests hit a real MySQL** — do not mock the DB (memory: `feedback_integration_tests`).
- **All new schema changes go through the in-process migration runner** (`apps/api/src/db/migrate.ts`); add the next numbered `.sql` file.
- **`ProjectDoc` is the single source of truth** — changes to clip/track shapes start in `packages/project-schema`.
- **Feature-sliced FE**: cross-feature sharing goes through `store/` or `shared/`, never sibling imports.
- **`apiClient` is the only `fetch` caller** in web-editor (`lib/api-client.ts`).
- **Files-as-Root:** `files` table is user-scoped root; `project_files` / `draft_files` pivots link files to containers. `ON DELETE RESTRICT` on the file side, `ON DELETE CASCADE` on the container side.

### Related areas of the codebase
- `apps/api/src/db/migrations/` — next numbered files 028+.
- `apps/api/src/repositories/*.repository.ts` — all list/get queries need `deleted_at IS NULL` filter.
- `apps/api/src/services/asset.service.ts`, `asset.delete.service.ts`, `generationDraft.service.ts`, (new) `project.service.ts` — delete flows.
- `apps/api/src/middleware/acl.middleware.ts` — ACL for restore must match original owner.
- `apps/web-editor/src/store/ephemeral-store.ts` — where timeline UI state lives.
- `apps/web-editor/src/features/project/hooks/useProjectInit.ts` — hydrates project on mount / projectId change.
- `apps/web-editor/src/features/home/` — `ProjectCard`, `HomePage`, `ProjectPanel`, `StoryboardPanel`.
- `apps/web-editor/src/features/generate-wizard/components/` — `GenerateWizardPage`, `MediaGalleryPanel`, `AssetThumbCard`, `AudioRowCard`.
- `apps/web-editor/src/features/asset-manager/components/AssetDetailPanel.tsx` — candidate for reuse in wizard.
- `apps/web-editor/src/shared/ai-generation/components/aiGenerationPanelStyles.ts` — hardcoded `width: 320px`.
- `apps/web-editor/src/shared/file-upload/useFileUpload.ts` — already auto-links on upload; same mechanism needed when dragging existing file.

### Reuse audit
- **`AssetDetailPanel`** — `apps/web-editor/src/features/asset-manager/components/AssetDetailPanel.tsx`: already implements preview / rename / metadata / delete / replace. Extension point: parameterize `context: 'project' | 'draft'` and swap the "add to" action. No refactor needed before reuse.
- **`history-store.ts`** — currently covers ProjectDoc patches only (Immer). Do NOT expand it to carry file/asset delete undo; build a separate short-lived "undo toast" mechanism backed by the new restore endpoints. Mixing would collide with Immer patch semantics.
- **`useFileUpload.ts` + `POST /projects/:id/files`** — already auto-links uploaded files to the container. Reuse the same endpoint for "link on use" (Issue 5): call it when a user drops an unlinked general file onto the timeline or inserts it as a prompt chip.
- **`fileLinks.response.service.ts`** — already projects `FileRow[]` → `AssetApiResponse[]`. Extend to accept a `scope: 'project' | 'draft' | 'all'` parameter rather than building a parallel service.
- **`media-worker/jobs/ingest.job.ts`** — already generates thumbnails and uploads them to S3. The asset.repository writes nothing for thumbnail URI today; extend ingest to write `files.thumbnail_uri` (new column) rather than introducing a separate thumbnail service.

---

## Subtasks

> Six EPICs, driven sequentially. Each EPIC is self-contained; stop and reassess if any one becomes blocked.

### EPIC A — Issue 1: Per-project timeline UI state (server-persisted)

### EPIC B — Issue 2: System-wide soft-delete + Undo


### EPIC C — Issue 3: Project preview = first frame

### EPIC D — Issue 4: Storyboard asset detail panel (wizard)

- [ ] **D2 — Wizard: open panel on asset click**
  - What: In `GenerateWizardPage`, add `selectedAsset` state. Clicking `AssetThumbCard` / `AudioRowCard` → opens `AssetDetailPanel` in the wizard right sidebar (not the existing `insertMediaRef` path — that moves to the panel's "Add to Prompt" button).
  - Where: `apps/web-editor/src/features/generate-wizard/components/GenerateWizardPage.tsx:65-71`, `MediaGalleryPanel.tsx`.
  - Why: Deliver the user-requested detail view.
  - Acceptance criteria:
    - Clicking an asset opens the panel with preview, editable name, info (resolution + duration for video, duration for audio, type/size for image), Preview button, Add-to-Prompt button, Delete button.
    - Delete triggers soft-delete (EPIC B) with undo toast.
    - Rename calls `PATCH /files/:id` (or the existing asset rename endpoint) and refreshes the list.
  - Test approach: component integration test on the wizard page with a mocked asset.
  - Risk: med.
  - Depends on: D1, B5.

### EPIC E — Issue 5: General vs project/draft file scope toggle

- [ ] **E1 — API: `scope` query param on asset list endpoints**
  - What: Extend `GET /projects/:id/assets` and `GET /generation-drafts/:id/assets` with `?scope=all|project|draft` (default `project`/`draft`). `scope=all` returns the user's entire `files` library (filtered by `deleted_at IS NULL`); scoped returns linked only.
  - Where: `assets.controller.ts`, `generationDrafts.controller.ts`, `fileLinks.response.service.ts` — extend to accept `scope`.
  - Why: Backend contract for the FE toggle.
  - Acceptance criteria: Zod-validated query param; default preserves current behavior.
  - Test approach: integration test for each scope value per endpoint.
  - Risk: low.
  - Depends on: B2 (the `deleted_at` filter lives in repos by then).

- [ ] **E2 — FE: scope toggle in `AssetBrowserPanel` (editor) and `MediaGalleryPanel` (wizard)**
  - What: Add a "show all" / "show only this project" toggle button below the last item in the gallery. Default: project/draft scope. If the scoped list is empty on first load, auto-switch to `all` with the toggle flipped.
  - Where: `apps/web-editor/src/features/asset-manager/components/AssetBrowserPanel.tsx`, `apps/web-editor/src/features/generate-wizard/components/MediaGalleryPanel.tsx`.
  - Why: Implements the user's requested default-scoped-with-toggle UX.
  - Acceptance criteria:
    - Toggle persists within session but is NOT stored server-side.
    - Empty scoped list → auto-show all + toggle indicates it.
    - Sticky toggle at the bottom of the scroll container.
  - Test approach: component tests covering empty/non-empty states and toggle click.
  - Risk: low.
  - Depends on: E1.

- [ ] **E3 — Auto-link general file when first used in a project/draft**
  - What: When a user drags an unlinked general file onto the timeline, or inserts it as a prompt chip, call `POST /projects/:id/files` (or `POST /generation-drafts/:id/files`) with that `file_id`. Endpoint already exists and is idempotent.
  - Where: `apps/web-editor/src/features/timeline/hooks/useDropAssetToTimeline.ts`; wizard `PromptEditor` insert-chip path.
  - Why: Ensures "used in project" files auto-appear in scoped view.
  - Acceptance criteria:
    - Dropping a general file on the timeline → on next reload under scope=project, the file is listed.
    - Re-dropping the same file does not duplicate pivot rows (INSERT IGNORE).
  - Test approach: unit tests on the hook; integration covered by existing pivot-insert tests.
  - Risk: low.
  - Depends on: E1.

### EPIC F — Issue 6: AI generation panel scales to full width in wizard

- [ ] **F1 — Make AI panel width fluid**
  - What: Change `aiGenerationPanelStyles.panel.width` from fixed `320px` to `100%` with `maxWidth: 720px` (preserves editor sidebar behavior via a `compact` prop where needed). Pass `compact={true}` from editor left sidebar; default `compact={false}` for wizard embedding.
  - Where: `apps/web-editor/src/shared/ai-generation/components/aiGenerationPanelStyles.ts:47`; `AiGenerationPanel.tsx` prop surface; call sites in `LeftSidebarTabs.tsx` (editor) and `MediaGalleryPanel.tsx:230` (wizard).
  - Why: Direct fix for the squeezed AI generated block.
  - Acceptance criteria:
    - In the wizard, the AI panel fills the available horizontal space up to `720px`.
    - Editor left sidebar unchanged (still 320px).
    - No layout shift in `ai-generation-panel-states.test.tsx` style assertions — update those tests.
  - Test approach: snapshot/style tests for both `compact` modes.
  - Risk: low.
  - Depends on: none.

---

## Open Questions / Blockers

- **EPIC B ambiguity — rendering during soft-delete window.** If a project clip references a soft-deleted `file_id`, what does the editor Player do? Decision baked into B3: render a "missing file" placeholder rather than crash. Confirm during B3 implementation if user wants a different behavior (e.g., block playback entirely).
- **EPIC B scope creep — hard-purge job.** Out of scope for this batch: an actual scheduled job to hard-delete rows older than N days. If the user wants this now, split into EPIC B-extension.
- **EPIC B — clip soft-delete granularity.** Clips live inside `project_clips_current` and also inside `project_versions.doc_json`. Clip "delete" in the editor today is a doc patch (undo/redo already covers it). Soft-delete of clips at the DB row level is therefore NOT part of EPIC B — only files/projects/drafts get row-level soft-delete. Confirm this carve-out is acceptable.
- **EPIC C — backfill `files.thumbnail_uri` for pre-existing files.** Out of scope; documented in C2.

---

## Notes for the implementing agent

- **Navigation mode during analysis:** ROADMAP (used `docs-claude/roadmap.md`, `docs-claude/api/roadmap.md`, `docs-claude/web-editor/roadmap.md`).
- **Domain skills loaded:** none of the conditional triggers fired (no Remotion composition changes, no Figma work, no Anthropic SDK, no new Playwright strategy).
- **Memory entries relevant:**
  - `feedback_branch_from_master` — start every subtask on a new branch off up-to-date master.
  - `feedback_integration_tests` — integration tests hit real MySQL; never mock the DB.
  - `project_cliptale_deploy` — validation flow is via Docker Compose stack at `15-236-162-140.nip.io`.
- **Architecture decisions confirmed by the user before planning:**
  - Issue 2 soft-delete: option "everywhere" (files + projects + drafts with `deleted_at`, restore endpoints, `/trash` panel).
  - Issue 1 timeline state: option "server-side" (new table + REST).
- **Ordering recommendation:** EPICs F → C → A → E → D → B. F is trivial and unblocks user frustration fast. C and A are isolated. E and D build on the soft-delete UX. B is the largest and touches the whole delete surface — land it last so the smaller wins aren't blocked.
- **Do NOT mix `features/` and `shared/` moves with logic changes in the same PR unless the move is required to deliver the feature** (D1 is the only exception and is called out explicitly).
- **Tests:** every repository change in EPIC B needs a co-located `.test.ts` update; integration tests must hit real MySQL via docker-compose.
- **Reviewer gates:** code-quality-expert, qa-engineer, design-reviewer, playwright-reviewer statuses start at NOT for each subtask entry in `development_logs.md` when executed.

---
_Generated by task-planner skill — 2026-04-20_

---
**Status: Ready For Use By task-executor**
