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

- [ ] **ST-B3: FE — SceneModal + SceneBlockNode thumbnails**
  - What: Build the Scene Detail Modal (opens on block click) with fields for name, prompt, duration, media list (max 6), style selector, and animation stub. Update `SceneBlockNode` to render thumbnail previews (max 3) and media type badges from `mediaItems`.
  - Where:
    - NEW `apps/web-editor/src/features/storyboard/components/SceneModal.tsx` (and `SceneModal.styles.ts` if needed)
    - EDIT `apps/web-editor/src/features/storyboard/components/SceneBlockNode.tsx` — add thumbnail rendering + media badges
    - EDIT `apps/web-editor/src/features/storyboard/store/storyboard-store.ts` — add `updateBlock(blockId, patch)` and `removeBlock(blockId)` actions if not already present
    - EDIT `apps/web-editor/src/features/storyboard/components/StoryboardPage.tsx` — wire `onNodeClick` → open SceneModal (scene nodes only); pass `draftId` to modal for media picker
  - Why: The Scene Detail Modal is the primary authoring tool — users fill in prompt/duration/media to give meaning to each storyboard block.
  - Acceptance criteria:
    - Clicking a SceneBlockNode (not START/END) opens SceneModal
    - Modal fields: Name (text input, auto-placeholder "SCENE 01" if empty), Prompt (textarea, required), Duration in seconds (number input, 1–180, required), Media list (shows added items with media type badge + filename; remove button per item)
    - "+ Add Media" button opens `AssetPickerModal` (reuse existing) filtered to image/video/audio; selected file appended to media list (max 6 enforced with toast if exceeded)
    - Style section shows STORYBOARD_STYLES cards (single-select radio); previously selected style is pre-selected
    - Animation section shows "Coming soon" disabled placeholder
    - "Save" updates the block in `storyboard-store` → autosave triggers within 30s
    - "Delete scene" button removes block from store; modal closes; START/END nodes cannot be opened
    - SceneBlockNode shows thumbnail grid: first 1–3 image/video items rendered via `buildAuthenticatedUrl()` from `/assets/:fileId/thumbnail`; if no image/video, shows a placeholder icon
    - Media type badges (IMAGE CLIP, VIDEO CLIP, AUDIO CLIP) rendered on SceneBlockNode for each unique media type present
  - Test approach: NEW `apps/web-editor/src/features/storyboard/__tests__/SceneModal.test.tsx` — render + field validation + max-media limit + save action + delete action; NEW `apps/web-editor/src/features/storyboard/__tests__/SceneBlockNode.thumbnails.test.tsx` — thumbnail rendering with 0/1/3/4 media items (capped at 3), badge rendering
  - Risk: med — `AssetPickerModal` integration needs a `onSelect(file)` callback wired in; confirm the existing modal supports a single-file callback mode (it's currently used for multi-add to AI prompts — verify and adapt if needed)
  - Depends on: ST-B2

- [ ] **ST-B4: FE — LibraryPanel**
  - What: Build the Library sidebar panel showing the user's scene templates with search, create, edit, delete, and "Add to Storyboard" actions.
  - Where:
    - NEW `apps/web-editor/src/features/storyboard/components/LibraryPanel.tsx`
    - NEW `apps/web-editor/src/features/storyboard/components/LibraryPanel.styles.ts`
    - NEW `apps/web-editor/src/features/storyboard/hooks/useSceneTemplates.ts` — React Query hook for `listSceneTemplates` with search debounce 300ms
    - EDIT `apps/web-editor/src/features/storyboard/components/StoryboardPage.tsx` — render `<LibraryPanel>` when `activeTab === 'library'`; pass `draftId` for "Add to Storyboard"
  - Why: Library Panel enables saving and reusing scene templates across storyboards, reducing authoring time.
  - Acceptance criteria:
    - Library tab renders a list of user's scene templates (empty state: "No templates yet")
    - Search input filters by template name, prompt, or attached file names (client-side filter on fetched list; re-fetch not required)
    - Template card shows: thumbnail grid (max 3 image/video previews via `buildAuthenticatedUrl`), template name, media type badges
    - "..." menu on each card: "Edit" → opens SceneModal in template-edit mode (saves via `updateSceneTemplate` API, not store), "Delete" → calls `deleteSceneTemplate` + removes from list, "Add to Storyboard" → calls `addTemplateToStoryboard({ templateId, draftId })` → adds returned block to storyboard store → switches `activeTab` to 'storyboard'
    - "+ New Scene" button → opens SceneModal in template-create mode (saves via `createSceneTemplate` API, stays in Library)
    - NO "Layout" button (design correction)
    - When Library tab is active, the canvas area below still shows the React Flow canvas (library is a sidebar panel only; the horizontal scene list described in Q38 refers to a visual hint — render a compact horizontal strip of storyboard blocks above the canvas when library is open, showing scene order)
  - Test approach: NEW `apps/web-editor/src/features/storyboard/__tests__/LibraryPanel.test.tsx` — render with mock templates, search filter, "Add to Storyboard" dispatches store action + switches tab, "+ New Scene" opens modal; NEW `apps/web-editor/src/features/storyboard/__tests__/useSceneTemplates.test.ts` — React Query hook wraps API correctly
  - Risk: med — SceneModal is shared between "edit block on canvas" mode and "edit/create template" mode; implement a `mode: 'block' | 'template'` prop to differentiate save behavior
  - Depends on: ST-B2, ST-B3 (SceneModal shared)

- [ ] **ST-B5: FE — EffectsPanel + sidebar design fixes**
  - What: Build the Effects sidebar panel (Visual Styles single-select + apply dialog + Animation stub) and apply all design corrections to StoryboardPage (remove V1.0, Export button, validate step labels).
  - Where:
    - NEW `apps/web-editor/src/features/storyboard/components/EffectsPanel.tsx`
    - NEW `apps/web-editor/src/features/storyboard/components/EffectsPanel.styles.ts`
    - EDIT `apps/web-editor/src/features/storyboard/components/StoryboardPage.tsx` — render `<EffectsPanel>` when `activeTab === 'effects'`; remove Export button from Effects view; remove V1.0 indicator; verify "STEP 2: STORYBOARD" label and "Next: Step 3 →" text
    - EDIT `apps/web-editor/src/features/storyboard/store/storyboard-store.ts` — add `applyStyleToBlock(blockId, styleId)` and `applyStyleToAllBlocks(styleId)` actions
  - Why: Effects Panel lets users assign visual styles to scenes, which influences AI generation prompts and post-processing; it completes the Part B feature set.
  - Acceptance criteria:
    - Effects tab renders "Visual Styles" section with cards from `STORYBOARD_STYLES` (3 cards: Cyberpunk, Cinematic Glow, Film Noir)
    - Each card shows style label, description, and a color swatch (previewColor)
    - Clicking a style card opens a small dialog: "Apply to this scene" / "Apply to all scenes" (disabled if no scene block is currently focused/selected — show tooltip "Select a scene first")
    - "Apply to this scene" calls `applyStyleToBlock(selectedBlockId, styleId)` → autosave
    - "Apply to all scenes" calls `applyStyleToAllBlocks(styleId)` → autosave
    - "Animation" section renders with "Coming soon" badge (all items disabled)
    - No "V1.0" text anywhere in the storyboard page
    - No "Export" button anywhere in the storyboard page
    - Bottom bar shows "STEP 2: STORYBOARD" (not STEP 3) and "Next: Step 3 →" (not "Generate")
  - Test approach: NEW `apps/web-editor/src/features/storyboard/__tests__/EffectsPanel.test.tsx` — render 3 style cards, click → dialog appears, "apply to all" dispatches correct store action, no-selection state disables apply-to-scene; snapshot test for design fixes (no V1.0, no Export button text)
  - Risk: low — read-only styles catalog + simple store actions; dialog is a local modal state (no API call)
  - Depends on: ST-B2, ST-B4 (activeTab wiring already done in ST-B4 for Library; extend same pattern for Effects)

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

- **⚠️ SceneModal shared between block-edit and template-edit modes** (ST-B3/ST-B4): The modal must behave differently depending on whether it's editing a canvas block (updates storyboard store) or a library template (calls `createSceneTemplate`/`updateSceneTemplate` API). Implement a `mode: 'block' | 'template'` prop with corresponding `onSave` callback to keep the component generic. The implementing agent should confirm there are no edge cases where the same modal instance needs to switch modes at runtime.

- **⚠️ AssetPickerModal single-file vs multi-file mode** (ST-B3): The existing `AssetPickerModal` is used for AI generation where multiple assets can be picked. The scene media list needs single-file-at-a-time picking (click to add one, repeat). Check if `AssetPickerModal` supports an `onSelect(file)` single-callback mode or if it needs a small prop addition to close on single selection.

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
