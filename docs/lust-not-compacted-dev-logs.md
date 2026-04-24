# Development Log (compacted — 2026-03-29 to 2026-04-24)

## Monorepo + DB Migrations
- added: root config, apps (api/web-editor/media-worker/render-worker), packages (project-schema, remotion-comps)
- added: migrations 001–036 — projects, assets, captions, versions, render_jobs, clips, users/sessions/auth, ai_generation_jobs, files/pivots, soft-delete, thumbnails, storyboard tables (blocks/edges/media/history), scene_templates/media
- fixed: APP_ env prefix; Zod startup validation; workspace→file paths

## Infrastructure
- added: Redis healthcheck, BullMQ error handlers, graceful shutdown, S3 stream + Range endpoint
- fixed: `@/` alias + `tsc-alias`; in-process migration runner + `schema_migrations` (sha256)

## Asset Upload + Browser UI
- added: S3 ingest pipeline (FFprobe → thumbnail → waveform); CRUD endpoints; presign + stream
- added: `features/asset-manager/` — AssetCard, AssetDetailPanel, UploadDropzone, UploadProgressList, AssetBrowserPanel
- added: asset rename (`displayName`); soft-delete/restore (30-day TTL, GoneError 410); `files` root table + `project_files`/`draft_files` pivots
- added: paginated envelope `{ items, nextCursor, totals }`; keyset cursor; `staleTime 60s`
- fixed: S3 CORS authoritative (`infra/s3/cors.json`); buildAuthenticatedUrl on all media elements

## VideoComposition + Preview + Stores
- added: `VideoComposition.tsx` (z-order, trim, image branch); `project-store.ts` (Immer patches); `ephemeral-store.ts`; `history-store.ts` (undo/redo)
- added: `useRemotionPlayer.ts`, `PreviewPanel.tsx`, `PlaybackControls.tsx`, `VolumeControl.tsx`, `usePrefetchAssets.ts`
- fixed: rAF tick; waitUntilDone() call; playhead freezing

## Timeline Editor
- added: `clip.repository.ts`, `clip.service.ts`, clips routes; PATCH + POST clip endpoints
- added: TimelineRuler, TrackHeader, ClipBlock, WaveformSvg, ClipLane, ClipContextMenu, TrackList, TimelinePanel, ScrollbarStrip
- added: useSnapping, useClipDrag, useClipTrim, useClipDeleteShortcut, useScrollbarThumbDrag, useTrackReorder, useTimelineWheel
- fixed: float→Math.round; split edge case; passive wheel; context menu portal; clip scroll sync; ruler seek

## Captions / Transcription
- added: `POST /assets/:id/transcribe` (202); `transcribe.job.ts` (S3 → Whisper → DB); word timestamps
- added: `CaptionEditorPanel.tsx`, `CaptionLayer.tsx` (per-word color, premountFor), `useAddCaptionsToTimeline.ts`

## Version History + Autosave
- added: version CRUD + restore; `useAutosave.ts` (2s debounce, beforeunload flush)
- added: `VersionHistoryPanel.tsx`, `RestoreModal.tsx`, `TopBar.tsx`, `SaveStatusBadge.tsx`

## Background Render Pipeline
- added: render CRUD (per-user 2-concurrent limit); `render.job.ts` (Remotion → S3); render-worker Docker
- added: `useExportRender.ts`, `RenderProgressBar.tsx`, `ExportModal.tsx`, `RendersQueueModal.tsx`
- fixed: REMOTION_ENTRY_POINT; black screen (presigned URLs); download URLs

## Authentication (Epic 8)
- added: session-based auth (32-byte tokens, SHA-256, 7-day TTL, bcrypt-12); rate limiting
- added: auth routes (register/login/logout/me); password-reset + email-verify (single-use)
- added: OAuth (Google + GitHub); Bearer injection + 401 interceptor; `APP_DEV_AUTH_BYPASS`
- added FE: LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage; AuthProvider, ProtectedRoute

## AI Platform — Epic 9 (fal.ai + ElevenLabs)
- removed: BYOK layer; added `APP_FAL_KEY`, `APP_ELEVENLABS_API_KEY`
- added: `fal-models.ts` (9 models), `elevenlabs-models.ts`; unified AI_MODELS (13); `falOptions.validator.ts`; `aiGeneration.assetResolver.ts`
- added: `ai-generate-audio.handler.ts`; `voice.repository.ts`; `GET /ai/models`, `GET /ai/voices`
- added FE: `CapabilityTabs.tsx`, `ModelCard.tsx`, `AssetPickerField.tsx`, `SchemaFieldInput.tsx`; 28 unit tests

## Video Generation Wizard
- added: migration 019; `generationDraft.*` (repository/service/controller/routes — 5 routes)
- added: `features/generate-wizard/` — PromptEditor, WizardStepper, GenerateWizardPage, MediaGalleryPanel, AssetPickerModal, PromptToolbar, WizardFooter
- added: `EnhancePromptJobPayload`; `enhancePrompt.job.ts`; enhance rate-limit (10/hr); `EnhancePreviewModal.tsx`

## Home + Project Hub
- added: migration 020; `listForUser`; `listStoryboardCardsForUser`; `GET /generation-drafts/cards`
- added: `features/home/` — HomePage, HomeSidebar, ProjectCard, StoryboardCard; `/` → HomePage

## Backlog Batch (2026-04-20)
- A: migration 028; `userProjectUiState.*`; `GET/PUT /projects/:id/ui-state`; `useProjectUiState.ts` (800ms debounce)
- B: soft-delete/restore for assets, projects, drafts; `GoneError` 410; trash cursor + `TrashPanel.tsx`
- C: migration 030; `ingest.job.ts` ffmpeg thumbnail → S3; `findProjectsByUserId` correlated for thumbnailFileId
- D: `AssetDetailPanel` → `shared/asset-detail/`; `WizardAssetDetailSlot.tsx`
- E: scope toggle (general/project/draft) in AssetBrowserPanel + MediaGallery; fire-and-forget auto-link
- F: `getPanelStyle(compact)` factory — compact=320px sidebar, fluid=100%/720px wizard

## Storyboard Editor — Part A (2026-04-22)
- added: migrations 031–034; `storyboard.*` (repo/service/controller/routes); 5 REST endpoints
- added: `storyboard-styles.ts` (3 styles); `@xyflow/react@^12.10.2`
- added: StartNode, EndNode, SceneBlockNode, CanvasToolbar, GhostDragPortal, StoryboardPage
- added: `useStoryboardCanvas.ts`, `useAddBlock.ts`, `useStoryboardDrag.ts`, `useStoryboardKeyboard.ts`, `ZoomToolbar.tsx`
- added: `storyboard-store.ts` (useSyncExternalStore), `storyboard-history-store.ts` (MAX=50, 1s debounce)
- added: `useStoryboardAutosave.ts` (30s debounce); 102/102 tests
- fixed: `pool.execute` → `pool.query` for LIMIT params (mysql2 ER_WRONG_ARGUMENTS); Docker image rebuild for `@xyflow/react`
- added: 5 storyboard OpenAPI paths + 8 schemas; 89/89 api-contracts tests

## Storyboard Editor — Part B (2026-04-23)
- ST-B1: migrations 035–036 (scene_templates, media); `sceneTemplate.*`; 6 routes; 73/73 tests
- ST-B2: SceneTemplate types + 6 API functions in `storyboard/api.ts`; 20 tests
- ST-B3: `SceneModal.tsx` (6-file split); `useSceneModal.ts`; real thumbnails + CLIP badges in SceneBlockNode; 25 tests
- ST-B4: `useSceneTemplates.ts` (300ms debounce), `LibraryPanel.tsx` (4-file split); `addBlockNode` action; 23 tests
- ST-B5: `EffectsPanel.tsx` (3 style cards + Coming Soon); `selectedBlockId`/`setSelectedBlock`/`applyStyleToBlock`; 22 tests
- ST-B6: `hideTranscribe` prop on AssetDetailPanel/AssetBrowserPanel; `StoryboardAssetPanel.tsx`; scope toggle labels
- hotfix: `useStoryboardDrag.ts` — `nativeEvent.clientX` → raw DOM event clientX (React Flow v12 passes DOM not synthetic)

## Storyboard Editor — Part C (2026-04-23)
- ST-C1: `restoreFromSnapshot(snapshot)` in storyboard-store — atomically replaces nodes/edges/positions; 6 unit tests
- ST-C2: `useStoryboardHistoryFetch.ts` (React Query, staleTime 30s); `StoryboardHistoryPanel.tsx` (320px, restore via window.confirm); `StoryboardTopBar` extracted; 10 tests
- fixed: `restoreFromSnapshot` — proper Node/Edge reconstruction from StoryboardBlock/StoryboardEdge; `positions?` optional in CanvasSnapshot
- documented: `docs/architecture-rules.md` §9.7 approved exceptions table

## Storyboard Bug Fixes (2026-04-24)
- ST-FIX-1: added `onNavigateHome` prop + Home button (`data-testid="home-button"`, SVG icon, topBar styles) to `StoryboardPage.topBar.tsx`; wired in `StoryboardPage.tsx`; tokens moved to `storyboardPageStyles.ts`; navigation tests split to `StoryboardPage.navigation.test.tsx` (177L); 23 tests pass
- ST-FIX-2: changed `draggable: false → true` for START/END sentinel nodes in `useStoryboardCanvas.blockToNode`, `storyboard-store.restoreFromSnapshot`, `storyboard-history-store.applySnapshot`; `deletable` unchanged; 4 new unit tests (2 per file); 24 total pass
- ST-FIX-3: refactored `useStoryboardAutosave` — signature `(draftId, nodes, edges)`; removed external store subscription; `useEffect([nodes, edges])` debounce; mutable refs for stale-closure safety; `StoryboardPage.tsx` call site updated; test file split: `useStoryboardAutosave.test.ts` (189L) + `useStoryboardAutosave.save-now.test.ts` (158L) + `useStoryboardAutosave.fixtures.ts` (42L); 13 tests pass
- ST-FIX-4: `useAddBlock.ts` — IDs now `crypto.randomUUID()` (server `blockInsertSchema.id` requires UUID; `local-` prefix caused 400); `handleAddBlock` extracted to `useHandleAddBlock.ts` hook (calls `addBlock` then `saveNow`); `StoryboardPage.save-on-add.test.tsx` (3 tests); `useHandleAddBlock.test.ts` (4 tests); `StoryboardPage.tsx` stays at 300L
- ST-FIX-5: `StoryboardHistoryPanel` — added `onRestore: (nodes, edges) => void` prop; `handleRestore` calls `onRestore(getSnapshot())` then `onClose`; `useHandleRestore.ts` hook re-wires `onRemove` on scene-block nodes then calls `setNodes/setEdges/pushSnapshot/saveNow`; wired in `StoryboardPage.tsx` (299L); 6 new hook tests + 12 panel tests (18 total pass)
- ST-FIX-6: `e2e/storyboard-fixes.spec.ts` — 4 Playwright E2E tests against deployed instance (all pass ~10.6s): home button URL assert, START sentinel draggable CSS class, block persistence (direct API PUT strategy — avoids saveNow React async race), history restore canvas assertion; added `import * as crypto from 'node:crypto'` for UUID generation in Node context

## Storyboard Follow-up Fixes (2026-04-24)
- FOLLOW-1: Added `vi.mock('@/features/storyboard/components/LibraryPanel')` to `StoryboardPage.assetPanel.test.tsx`; fixes 2 pre-existing failures ("No QueryClient set") caused by LibraryPanel calling `useQueryClient()` when LIBRARY tab is clicked; 7/7 tests now pass (was 5/7)

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-04-24. Test-only change (no UI modifications). No design tokens, colors, spacing, typography, or components changed. Skipped design review — not applicable.T
checked by playwright-reviewer - YES

---

## [2026-04-24]

### Task: Storyboard Follow-up Fixes (Guardian Recommendations)
**Subtask:** FOLLOW-2: Fix non-UUID edge IDs in useStoryboardDrag.ts

**What was done:**
- Replaced `id: \`edge-${oldEdge.source}-${node.id}\`` and `id: \`edge-${node.id}-${oldEdge.target}\`` at lines 232 and 240 of `useStoryboardDrag.ts` with `id: crypto.randomUUID()` to match server `blockInsertSchema.id: z.string().uuid()` validation
- Created `apps/web-editor/src/features/storyboard/hooks/useStoryboardDrag.test.ts` — 10 tests covering: UUID format of generated edge IDs (FOLLOW-2 acceptance), distinct IDs for both new edges, dragStart sets ghostOpacity, dragStart no-ops for non-scene-block, drag updates clientX/Y, dragStop clears state, no setEdges when dropped far from midpoint, auto-insert fires when dropped near edge midpoint, syncRefs keeps refs fresh for dragStop

**Notes:**
- `crypto.randomUUID()` is available in all target browsers (Chromium 92+, Firefox 95+, Safari 15.4+) and in jsdom (used by the test environment via globalThis.crypto)
- No existing tests were broken — there were no prior tests for this hook; all 7 storyboard hook test files (60 tests) still pass
- `edge-${source}-${target}` pattern is gone from the file; grep confirms zero occurrences

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: FOLLOW-2: Fix non-UUID edge IDs in useStoryboardDrag.ts</summary>

- What: In `apps/web-editor/src/features/storyboard/hooks/useStoryboardDrag.ts`, change edge ID generation from `edge-${source}-${target}` to `crypto.randomUUID()` at lines ~232 and ~240 (wherever edges are constructed during drag-connect).
- Where: `apps/web-editor/src/features/storyboard/hooks/useStoryboardDrag.ts` — find the `id: \`edge-\${...}\`` patterns and replace with `id: crypto.randomUUID()`
- Why: Server `blockInsertSchema` validates edge IDs as UUID. Non-UUID IDs are currently accepted only because the PUT endpoint may not enforce UUID on edges — but any future Zod tightening would silently break drag-created connections. The sibling issue (block IDs) was fixed in ST-FIX-4; this closes the matching edge gap.
- Acceptance criteria:
  - All edge ID generation in `useStoryboardDrag.ts` uses `crypto.randomUUID()`
  - No `edge-${source}-${target}` string patterns remain in the file
  - Existing `useStoryboardDrag` tests still pass
- Test approach: Extend `apps/web-editor/src/features/storyboard/hooks/useStoryboardDrag.test.ts` — assert that after a simulated connect event, the resulting edge has an id matching `/^[0-9a-f-]{36}$/` (UUID v4 pattern)
- Risk: low — ID format change only; React Flow does not require edge IDs to follow any format
- Depends on: none

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-04-24. Logic-only change (edge ID format, crypto.randomUUID). No UI/design tokens/spacing/typography changes. Zero visual surface. Not applicable to design review — skipped.
checked by playwright-reviewer - YES

---

## Architectural Decisions
- §9.7 300-line cap: `*.fixtures.ts` + `.<topic>.test.ts` splits; approved exceptions: `fal-models.ts` (1093L), `file.repository.ts` (306L), `useProjectInit.test.ts` (318L), `StoryboardCard.tsx` (319L), `storyboard-store.ts` (307L); e2e/*.spec.ts exempt
- Worker env: only `index.ts` reads config keys; handlers receive secrets via `deps`
- Migration runner: in-process + sha256 checksum; DDL non-transactional; INSERT after DDL
- Vitest: `pool: 'forks' + singleFork: true`; each split file has own `vi.hoisted()`
- Files-as-root: `files` user-scoped; `project_files`/`draft_files` pivots (CASCADE container, RESTRICT file)
- Soft-delete: `deleted_at IS NULL`; `*IncludingDeleted` helpers; 30-day TTL → GoneError 410
- mysql2: `pool.query` (not `execute`) for LIMIT params; JSON cols need `typeof==='string'` guard
- Auth: `buildAuthenticatedUrl()` required on all `/assets/:id/{thumbnail,stream}` media elements
- Store reset: `resetProjectStore(projectId) + resetHistoryStore()` BEFORE `fetchLatestVersion`
- `CanvasSnapshot.positions` optional — server omits it; `restoreFromSnapshot` falls back to `block.positionX/Y`
- Typography §3: 14/400 body, 12/500 label, 16/600 heading-3; 4px grid; radius-md 8px
- Per-file styles: hex constants at top of `.styles.ts`; no CSS custom properties in web-editor
- DEV_AUTH_BYPASS injects `dev-user-001`; all test assertions must expect that id
- E2E CORS: `page.request.fetch()` + `page.route()` with `access-control-allow-origin: *`; PUT requests use `page.request.put` (server-side, bypasses browser CORS)
- Storyboard autosave: `useStoryboardAutosave` reads React state via params+refs, NOT external store subscription
- Storyboard block IDs: always `crypto.randomUUID()` at creation — server schema requires UUID; `local-` prefix rejected
- Immediate save pattern: extract callback to `useHandle*.ts` hook (addBlock→saveNow, restore→saveNow) to keep `StoryboardPage.tsx` ≤300L

---

## Known Issues / TODOs
- ACL middleware stub — real ownership check deferred (B3 it.todo 403 tests)
- `bytes` NULL after ingest (HeadObject needs worker bucket config)
- Lint fails — ESLint v9 config-migration error workspace-wide
- Pre-existing TS errors in `App.PreviewSection.test.tsx`, `App.RightSidebar.test.tsx`
- Stitch OQ-S1..S4 (dup Landing, tablet/mobile, secondary screens, spacing echo)
- Infinite scroll: BE pagination shipped; FE `fetchNextAssetsPage()` exported but unwired
- `parseStorageUri` duplicated across asset.service + file.service → candidate `lib/storage-uri.ts`
- `linkFileToProject` duplicated across timeline/api.ts + shared/file-upload/api.ts
- Hard-purge cron for soft-deleted rows past 30 days not implemented
- E2E image/audio timeline-drop tests skip when no assets linked to test project
- **ST-B6 test bug**: `StoryboardPage.assetPanel.test.tsx` needs `vi.mock('@/features/storyboard/components/LibraryPanel')` to fix useQueryClient() error
- **ST-B5 TS2305**: `STORYBOARD_STYLES` import from api-contracts fails in container (stale dist); fix: rebuild api-contracts Docker image
- **Keyboard undo/redo broken** (out of scope ST-FIX): `storyboard-history-store.applySnapshot` calls `storyboard-store.setNodes/setEdges` but React Flow renders from `useState` — Ctrl+Z/Y don't visually update canvas
- **Edge IDs non-UUID**: drag-created edges use `edge-${source}-${target}` format — not validated by server Zod schema; potential save issue

---

## [2026-04-24]

### Task: Storyboard Follow-up Fixes (Guardian Recommendations)
**Subtask:** FOLLOW-3: Add E2E UI-click test for ST-FIX-4 save-on-add wiring

**What was done:**
- Added a 5th Playwright test to `e2e/storyboard-fixes.spec.ts` as `ST-FIX-4 (UI) — clicking "+" triggers PUT /storyboards/:draftId within 5 s`
- Test registers `page.waitForRequest` for PUT to `/storyboards/` BEFORE clicking `[data-testid="add-block-button"]`, then awaits the captured request
- Confirmed `data-testid="add-block-button"` is correct by reading `CanvasToolbar.tsx`
- Added an explanatory comment about why `req.url().includes('/storyboards/')` matches in both local and deployed environments (browser sends to `http://localhost:3001/storyboards/...` on deployed instance; CORS workaround intercepts *after* the request is observed by `waitForRequest`)
- All 5 tests in the suite pass against the deployed instance (11.8 s total; new test: 2.3 s)

**Notes:**
- The `waitForRequest` promise is registered before `addBlockBtn.click()` to avoid any race between a very fast save flush and the listener registration
- The test only asserts the PUT was initiated (not that it succeeded) — this is intentional per the task spec; the async React state race (documented in ST-FIX-3/4) can cause the PUT body to be stale, but request initiation is the coverage signal
- Test passes cleanly at 2.3 s — well within the 5 s `waitForRequest` timeout

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: FOLLOW-3</summary>

- [ ] **FOLLOW-3: Add E2E UI-click test for ST-FIX-4 save-on-add wiring**
  - Test clicks `[data-testid="add-block-button"]` and asserts PUT to `/storyboards/:draftId` within 5 s
  - Uses `page.waitForRequest` registered before the click
  - Passes against `https://15-236-162-140.nip.io`

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-04-24. E2E test-only addition (no UI components, no design tokens, no visual changes). Not applicable to design review — skipped.
checked by playwright-reviewer - YES
