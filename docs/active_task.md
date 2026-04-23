# Active Task

## Task
**Name:** Storyboard Editor — Part B: Scene Modal + Library + Effects
**Source:** `docs/general_tasks.md` — "Storyboard Editor Step 2 Part B"
**Goal:** Build the scene detail modal, library panel, and effects panel for the Storyboard Editor, backed by a new `scene_templates` DB layer and CRUD API.

---

## Context

### Why this task matters
Part A delivered the canvas foundation (blocks, edges, autosave, undo/redo). Part B adds the content-authoring layer: users need to fill each scene block with a name, prompt, duration, and media, browse/reuse scene templates via the Library panel, and apply visual styles via the Effects panel. Without Part B the storyboard is an empty canvas with no way to attach meaning to blocks.

### Relevant architecture constraints
- All DB changes go through numbered SQL migration files (`apps/api/src/db/migrations/`) — in-process runner + `schema_migrations` table; files must be idempotent.
- New REST endpoint path: contracts → routes → controller → service → repository (each a separate file); wired in `apps/api/src/index.ts`.
- FE feature code lives in `apps/web-editor/src/features/storyboard/`; shared UI in `apps/web-editor/src/shared/`.
- `useSyncExternalStore`-based storyboard store (`storyboard-store.ts`) — all storyboard mutations go through the store; autosave (30s) persists via `PUT /storyboards/:draftId`.
- Per-file design tokens: hex constants at top of `.styles.ts` files; NO CSS custom properties.
- React component props: `interface` (not `type`), suffixed `Props` — §9.
- 300-line cap per file (§9.7) — split large components with dot-infix filenames (e.g. `LibraryPanel.templateCard.tsx`).
- `buildAuthenticatedUrl()` must wrap all `<img>`/`<video>` thumbnails from `/assets/:id/{thumbnail,stream}`.
- Integration tests must hit a real MySQL — never mock the database.
- OpenAPI contracts updated in `packages/api-contracts/src/openapi.ts` for all new public endpoints.

### Related areas of the codebase
- `apps/web-editor/src/features/storyboard/` — entire storyboard feature slice (types, api, hooks, store, components)
- `apps/web-editor/src/features/storyboard/components/StoryboardPage.tsx` — main shell; activeTab state drives sidebar but panels not yet rendered
- `apps/web-editor/src/features/storyboard/components/SceneBlockNode.tsx` — scene card on canvas; needs thumbnail + badge rendering from mediaItems
- `apps/web-editor/src/features/storyboard/types.ts` — StoryboardBlock, BlockMediaItem, StoryboardSidebarTab types
- `apps/web-editor/src/features/storyboard/api.ts` — API client functions; needs scene-template CRUD additions
- `apps/web-editor/src/features/storyboard/store/storyboard-store.ts` — useSyncExternalStore external store; block mutations go here
- `apps/api/src/routes/storyboard.routes.ts` — existing 5 storyboard routes
- `apps/api/src/services/storyboard.service.ts` + `apps/api/src/repositories/storyboard.repository.ts`
- `packages/api-contracts/src/storyboard-styles.ts` — STORYBOARD_STYLES catalog (3 presets) — read-only, no DB backing
- `packages/api-contracts/src/openapi.ts` — OpenAPI spec; needs scene-template paths + schemas added

### Reuse audit
- `apps/web-editor/src/features/storyboard/types.ts` — extend with `SceneTemplate`, `SceneTemplateMedia`, `CreateSceneTemplatePayload`, `UpdateSceneTemplatePayload`
- `apps/web-editor/src/features/storyboard/api.ts` — extend with scene-template CRUD functions (same pattern as existing storyboard API functions)
- `apps/web-editor/src/shared/asset-detail/AssetDetailPanel.tsx` — has a media picker / asset selector pattern; reference for "Select existing file" UX in SceneModal
- `apps/web-editor/src/features/generate-wizard/components/AssetPickerModal.tsx` — existing file picker modal (520×580, type-filtered, focus trap); reuse directly for "Select existing file" in SceneModal
- `apps/web-editor/src/shared/file-upload/UploadDropzone.tsx` — reuse for "Upload new file" path inside SceneModal media section
- `apps/web-editor/src/features/storyboard/components/SidebarTab.tsx` — already used for tab buttons; no changes needed
- `packages/api-contracts/src/storyboard-styles.ts` — STORYBOARD_STYLES array; import directly in EffectsPanel and SceneModal (single source of truth, no duplication)
- `apps/api/src/repositories/storyboard.repository.ts` — pattern for DB access (pool.query with parameterized queries); follow same style in sceneTemplate.repository.ts

---

## Subtasks

- [x] **ST-B1: DB + BE — Scene Templates API**
  - What: Add migrations 035 (scene_templates) + 036 (scene_template_media), implement full CRUD for scene templates (repository → service → controller → routes), wire router, update OpenAPI contracts.
  - Where:
    - NEW `apps/api/src/db/migrations/035_scene_templates.sql`
    - NEW `apps/api/src/db/migrations/036_scene_template_media.sql`
    - NEW `apps/api/src/repositories/sceneTemplate.repository.ts`
    - NEW `apps/api/src/services/sceneTemplate.service.ts`
    - NEW `apps/api/src/controllers/sceneTemplate.controller.ts`
    - NEW `apps/api/src/routes/sceneTemplate.routes.ts`
    - EDIT `apps/api/src/index.ts` — register `/scene-templates` router
    - EDIT `packages/api-contracts/src/openapi.ts` — add 6 scene-template paths + 3 schemas
  - Why: Enables persistent scene template storage required by LibraryPanel. The `POST /scene-templates/:id/add-to-storyboard` endpoint creates a new storyboard block from a template (accepts `{ draftId, positionX?, positionY? }` in body, returns the new StoryboardBlock).
  - Acceptance criteria:
    - `GET /scene-templates` returns `{ items: SceneTemplate[] }` scoped to the authenticated user (soft-delete aware: `deleted_at IS NULL`)
    - `POST /scene-templates` creates a template with name, prompt, duration_s, style, and optional media array (up to 6 items: file_id + media_type + sort_order); returns 201 with full template
    - `GET /scene-templates/:id` returns 404 if not owned by user
    - `PUT /scene-templates/:id` updates fields + replaces media list atomically in a transaction
    - `DELETE /scene-templates/:id` soft-deletes (sets `deleted_at`)
    - `POST /scene-templates/:id/add-to-storyboard` creates a new `storyboard_blocks` row from template data + inserts `storyboard_block_media` rows; requires user owns both the template and the draft; returns 201 with the new StoryboardBlock
    - All endpoints return 401 if unauthenticated, 404 if template not found/not owned
    - OpenAPI spec has all 6 paths + `SceneTemplate`, `SceneTemplateMedia`, `AddToStoryboardPayload` schemas
  - Test approach: NEW `apps/api/src/__tests__/scene-templates-endpoint.test.ts` + `scene-templates-add-to-storyboard.test.ts` (Vitest integration, real MySQL); happy path + not-found + wrong-owner + media-limit-6 + add-to-storyboard cross-ownership; NEW `packages/api-contracts/src/__tests__/openapi.scene-templates.paths.test.ts` (schema validation)
  - Risk: med — `add-to-storyboard` touches two tables (`storyboard_blocks` + `storyboard_block_media`) and must respect the storyboard's block topology (position on canvas); use a default position offset so blocks don't stack exactly on top of each other if added multiple times
  - Depends on: none

- [x] **ST-B4: FE — LibraryPanel** — DONE (2026-04-23, branch feat/st-b4-library-panel)

- [ ] **ST-B6: FE — General Tasks A1–A3 (asset panel fixes for Storyboard)**
  - What: Fix the three general tasks from `docs/general_tasks.md` that are scoped to the Storyboard page or the shared AssetBrowserPanel:
    (A1) Rename scope toggle buttons; fix sticky positioning.
    (A2) Wire asset rename on the Storyboard page (render `WizardAssetDetailSlot` when an asset is selected).
    (A3) Hide Transcribe button on the Storyboard page.
  - Where:
    - EDIT `apps/web-editor/src/features/asset-manager/components/AssetBrowserPanel.tsx` — A1: update button label strings; A1: make toggle button sticky at bottom of list (position absolute/sticky within scroll container, or flex column with overflow-y on list + shrink-0 on button)
    - EDIT `apps/web-editor/src/shared/asset-detail/AssetDetailPanel.tsx` — A3: accept optional `hideTranscribe?: boolean` prop; conditionally render `<TranscribeButton>`
    - EDIT `apps/web-editor/src/features/storyboard/components/StoryboardPage.tsx` — A2: render `<WizardAssetDetailSlot>` in an appropriate slot when an asset is selected (reuse existing `useWizardAsset` pattern); A3: pass `hideTranscribe={true}` to asset detail panel
  - Why: These three tasks were identified as bugs/UX issues in the backlog and are directly related to the Storyboard page being built in Part B; fixing them now avoids a separate task cycle.
  - Acceptance criteria:
    - Scope toggle button text reads exactly "Show All System Assets" (when scope = project) and "Show only project assets" (when scope = all)
    - Toggle button is visible below the last asset item in the list when there's no scroll; when list overflows and scrollbar is active, button is fixed/sticky at the bottom of the panel (above the upload button), always visible
    - On the Storyboard page, clicking an asset in a media list shows its detail (rename field functional via `InlineRenameField`)
    - `TranscribeButton` does NOT appear anywhere on the Storyboard page
  - Test approach: EDIT/NEW unit tests for `AssetBrowserPanel` toggle button text; NEW `apps/web-editor/src/features/storyboard/__tests__/StoryboardPage.assetPanel.test.tsx` — verify transcribe button absent; verify rename field present when asset selected
  - Risk: low — no new API; purely additive props + text changes; `WizardAssetDetailSlot` already exists and proven in wizard
  - Depends on: ST-B5 (storyboard page changes consolidated)

---

## Open Questions / Blockers

- **RESOLVED (ST-B3):** SceneModal implemented with `mode: 'block' | 'template'` prop; `onSave` callback type changes based on mode. No runtime mode-switch edge case. AssetPickerModal already supports `onPick(asset)` single-file callback (closes immediately after pick via `handlePick → onPick → onClose` chain). No adaptation needed.

- **⚠️ "Apply to this scene" requires a focused scene** (ST-B5): The Effects panel needs to know which block is currently "selected/focused" to enable "Apply to this scene". The storyboard store or ephemeral state needs a `selectedBlockId: string | null` field. Verify whether `storyboard-store.ts` already tracks this or if it needs to be added.

- **"Horizontal scene list when library is open"** (ST-B4, Q38): The spec says "Main area при відкритій Library показує горизонтальний список сцен storyboard". This means a compact horizontal strip showing current storyboard scenes in order overlaid/above the canvas when Library tab is active. This is a visual hint — implement as a thin horizontal scrollable row of scene thumbnails above the canvas area (not a full layout switch). If this interpretation conflicts with design intent, implement as-noted and flag for design review.

None of the above are blockers — the implementing agent should proceed with the interpretations documented here and flag deviations in the PR description.

---

## Notes for the implementing agent
- **Navigation mode:** ROADMAP — `./docs-claude/roadmap.md` + `./docs-claude/web-editor/roadmap.md` + `./docs-claude/api/roadmap.md` consulted during analysis.
- **Domain skills loaded:** None loaded (task is UI-heavy but spec is fully documented in `docs/general_tasks.md` Q&A; no Figma URL provided).
- **Relevant memory entries:**
  - `feedback_branch_from_master.md` — always `git fetch origin && git checkout -b <name> origin/master` before any edits
  - `project_cliptale_deploy.md` — docker+Caddy at `15-236-162-140.nip.io`; HMR picks up `apps/web-editor/src/**` changes live
- **Storyboard store pattern:** `storyboard-store.ts` uses `useSyncExternalStore`. All mutations go through store actions; autosave (`useStoryboardAutosave.ts`) serializes and PUTs the full state every 30s. New actions `updateBlock`, `removeBlock`, `applyStyleToBlock`, `applyStyleToAllBlocks` should follow the existing action pattern in the store.
- **Media thumbnails:** always wrap in `buildAuthenticatedUrl(url)` from `apps/web-editor/src/lib/api-client.ts`. URL pattern: `${apiBaseUrl}/assets/${fileId}/thumbnail`.
- **Migration idempotency:** wrap DDL in INFORMATION_SCHEMA guards (e.g. `IF NOT EXISTS` for tables). Follow the pattern in migrations 031–034.
- **§9.7 line cap:** 300 lines per file. Split large components with dot-infix: `LibraryPanel.templateCard.tsx`, `SceneModal.mediaSection.tsx`, etc. E2E specs in `e2e/*.spec.ts` are exempt.
- **Typography:** body 14/400, label 12/500, heading-3 16/600; spacing 4px multiples; radius-md 8px (design-guide §3).
- **General Tasks A1–A3** are included as ST-B6 to close out the backlog items in one pass alongside the storyboard work.

---
_Generated by task-planner skill — 2026-04-23_

---
**Status: Ready For Use By task-executor**
