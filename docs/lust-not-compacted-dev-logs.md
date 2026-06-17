# Development Log (compacted — 2026-03-29 to 2026-05-29)

## Monorepo + DB Migrations
- added: root config, apps/packages scaffold; migrations 001–042 (projects, assets, captions, versions, render_jobs, clips, users/auth, ai_generation_jobs, files/pivots, soft-delete, thumbnails, storyboard tables, scene_templates/media, storyboard plan/illustration/video/music jobs, illustration references + approval, generation_drafts created-project pointers)
- fixed: APP_ env prefix; Zod startup validation; workspace→file paths; in-process migration runner + sha256

## Infrastructure
- added: Redis healthcheck, BullMQ error handlers, graceful shutdown, S3 stream + Range endpoint, `@/` alias + tsc-alias

## Asset Upload + Browser UI
- added: S3 ingest pipeline (FFprobe→thumbnail→waveform); CRUD endpoints; presign + stream
- added: `features/asset-manager/` — AssetCard, AssetDetailPanel, UploadDropzone, UploadProgressList, AssetBrowserPanel
- added: asset rename, soft-delete/restore (30-day TTL, GoneError 410), `files` root table + pivots, paginated envelope + keyset cursor
- fixed: S3 CORS authoritative; `buildAuthenticatedUrl` on all media elements

## VideoComposition + Preview + Stores
- added: `VideoComposition.tsx`, `project-store.ts` (Immer patches), `ephemeral-store.ts`, `history-store.ts` (undo/redo)
- added: `useRemotionPlayer.ts`, `PreviewPanel.tsx`, `PlaybackControls.tsx`, `VolumeControl.tsx`, `usePrefetchAssets.ts`
- fixed: rAF tick; waitUntilDone(); playhead freezing

## Timeline Editor
- added: clip repo/service/routes (PATCH + POST); TimelineRuler, TrackHeader, ClipBlock, WaveformSvg, ClipLane, ClipContextMenu, TrackList, TimelinePanel, ScrollbarStrip
- added: useSnapping, useClipDrag, useClipTrim, useClipDeleteShortcut, useScrollbarThumbDrag, useTrackReorder, useTimelineWheel
- fixed: float→Math.round; split edge case; passive wheel; context menu portal; clip scroll sync; ruler seek

## Captions + Version History + Background Render
- added: `POST /assets/:id/transcribe` (202); transcribe job; `CaptionEditorPanel.tsx`, `CaptionLayer.tsx`, `useAddCaptionsToTimeline.ts`
- added: version CRUD + restore; `useAutosave.ts`; VersionHistoryPanel, RestoreModal, TopBar, SaveStatusBadge
- added: render CRUD (2-concurrent limit); `render.job.ts` (Remotion→S3); render-worker Docker; ExportModal, RendersQueueModal
- fixed: REMOTION_ENTRY_POINT; black screen (presigned URLs); download URLs

## Authentication
- added: session auth (32-byte tokens, SHA-256, 7-day TTL, bcrypt-12); rate limiting; auth routes; password-reset + email-verify; OAuth (Google/GitHub); Bearer injection + 401 interceptor; `APP_DEV_AUTH_BYPASS`
- added FE: LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage; AuthProvider, ProtectedRoute

## AI Platform + Video Generation Wizard
- added: `fal-models.ts` (9 models + `openai/gpt-image-2`), `elevenlabs-models.ts`, unified AI_MODELS; `ai-generate-audio.handler.ts`; `GET /ai/models`, `GET /ai/voices`
- added FE: CapabilityTabs, ModelCard, AssetPickerField, SchemaFieldInput
- added: `generationDraft.*` (5 routes); generate-wizard — PromptEditor, WizardStepper, MediaGalleryPanel, AssetPickerModal, EnhancePromptModal; enhance rate-limit 10/hr
- added: `features/home/` — HomePage, HomeSidebar, ProjectCard, StoryboardCard

## Backlog Batch (2026-04-20)
- added: `userProjectUiState.*`; GET/PUT /projects/:id/ui-state; `useProjectUiState.ts` (800ms debounce)
- added: soft-delete/restore for assets/projects/drafts; trash cursor + TrashPanel
- added: ffmpeg thumbnail → S3 in ingest job; `AssetDetailPanel` → `shared/asset-detail/`
- added: scope toggle (general/project/draft) in AssetBrowserPanel + MediaGallery; `getPanelStyle(compact)` factory

## Storyboard Editor — Core
- added: storyboard repo/service/controller/routes (5 endpoints); 5 OpenAPI paths + schemas
- added: StartNode, EndNode, SceneBlockNode, CanvasToolbar, StoryboardPage, ZoomToolbar; SceneTemplate (6 routes); SceneModal; LibraryPanel; EffectsPanel
- added: `useStoryboardCanvas`, `useAddBlock`, `useStoryboardDrag`, `useStoryboardKeyboard`, `useStoryboardAutosave` (5s debounce); `storyboard-store.ts`, `storyboard-history-store.ts` (MAX=50, 1s debounce); `restoreFromSnapshot`, `useStoryboardHistoryFetch`, StoryboardHistoryPanel, StoryboardTopBar
- fixed: `pool.execute→pool.query` for LIMIT; `nativeEvent.clientX`→raw DOM event; `positions?` optional

## Storyboard Bug Fixes (2026-04-24–27)
- fixed: Home button prop; START/END `draggable: true`; autosave signature `(draftId, nodes, edges)`; block IDs → `crypto.randomUUID()`; `useHandleRestore` re-wires onRemove/setNodes/setEdges
- fixed: `insertSentinelsAtomically` (`SELECT COUNT(*) FOR UPDATE` + deadlock retry); `dedupSentinels()`; deferred `saveNow` on drag-end/connect/edge change; `updateDraftStatus('step2')` in `loadStoryboard`
- fixed: sentinel durationS 0→5; real draftId in useAddBlock; edge IDs → UUID; mediaItem IDs → UUID; useSceneModal syncs `node.data.block` in-place; `useStoryboardHistorySeed` auto-restores with `skipSave:true`
- fixed: LibraryPanel add lifted to `handleAddFromLibrary` (canvas re-render); `handleNodesChange` filters non-dragging changes; removed `StoryboardAssetPanel` (full-width canvas); `SnapshotMinimap`; AssetPickerModal opt-in `uploadTarget`/`uploadDraftId`

## Storyboard History Thumbnails + Polish (2026-04-28–29, SB-POLISH-1)
- fixed: `captureCanvasThumbnail` — `imagePlaceholder` (1×1 GIF) for CORS; `crossOrigin="anonymous"` on `<img>`; `getBoundingClientRect()` source size + `canvasWidth/canvasHeight` (320×180) output + `backgroundColor: SURFACE` (resolves black-thumbnail JPEG); normalized in-memory resource cache
- fixed: drag autosave/history — `handleNodeDragStop` is sole save path (pushSnapshot + deferred saveNow); `handleNodesChange` filters ALL position changes
- added: `useStoryboardKnifeTool` — Ctrl/Meta-alone activates, any non-modifier exits; `cutEdge` atomic (setEdges + pushSnapshot + saveNow); wired into `StoryboardCanvas` (crosshair cursor, panOnDrag/nodesDraggable off, `onEdgeClick→onCutEdge`)

## Storyboard Add-Block History + Undo/Redo (2026-05-06–12)
- fixed: toolbar/library Add Block persists history snapshot incl. new block; `storyboard-history-store.push()` supports immediate persistence; StoryboardPage invalidates `['storyboard-history', draftId]`
- fixed: `undo()`/`redo()` return applied nodes/edges while syncing store; `useStoryboardKeyboard` forwards snapshots to StoryboardPage restore path; `useHandleRestore` supports `skipSnapshot` (undo/redo) + `deferSave`

## Stage 2 Draft Settings — STAGE2-DRAFT-1..6 + Custom Length (2026-05-12)
- added: shared `draftSettingsSchema` on `PromptDoc.settings`; exported `DraftSettings`/`DraftVideoLengthSeconds`/`DraftAspectRatio`/`DraftStyleKey`; `DEFAULT_DRAFT_SETTINGS` + `getDraftSettings()` for legacy drafts (no mutation/resave)
- added: API create/update validation + repository JSON mapping; OpenAPI `PromptDoc`/`PromptBlock`/`DraftSettings`
- added FE: Step 1 `DraftSettingsControls` (length/aspect/style) wired through `setDoc` autosave; optimistic local snapshot composes rapid changes; numeric seconds input (1–600) + presets 15/30/60/90/120
- fixed: AI Enhance worker preserves `PromptDoc.settings`; `useEnhancePrompt` merges source settings; WizardFooter flushes settings before storyboard nav
- e2e: `generate-wizard-settings.spec.ts` settings persistence/resume

## Stage 2 Storyboard Planning — STAGE2-PLAN-1..6 + Runtime Fixes (2026-05-13)
- added: shared storyboard plan schemas/types, job status/result schemas, deterministic scene-count helper (1–600s, clamp 40 scenes max)
- added: `storyboard_plan_jobs` migration + repository (queued/running/completed/failed, durable JSON snapshots, sanitized errors)
- added: `POST /generation-drafts/:id/storyboard-plan` (202) + `GET .../:jobId` polling (reads persisted rows, not BullMQ returns); OpenAPI contract
- added: media-worker planning context resolver (PromptDoc + referenced `files` via `draft_files`, metadata/transcript snippets, validation of dangling/deleted/unauthorized/kind-mismatched refs); worker-local S3 read presign (images vision, video thumbnail, audio transcript-first); `storyboard-plan` BullMQ worker + OpenAI handler (JSON-only multimodal, `modelPreference` allowlist)
- fixed: media-worker Docker dup AWS/Smithy types via local `getSignedUrl` adapter; accept `dev-user-001`; compact `path: message` validation errors

## Stage 2 Storyboard Scenes — STAGE2-SCENES-1..5 (2026-05-14)
- added: `applyLatestCompletedPlan(userId, draftId)` — ownership, latest plan lookup, deterministic START→scenes→END graph, `visualPrompt`→scene `prompt`, sentinel reuse, transaction-scoped replacement + history snapshot, canonical reload
- added: `POST /storyboards/:draftId/apply-latest-plan` route + OpenAPI; integration coverage
- added FE: storyboard plan API helpers; `useStoryboardPlanGeneration` (idle/queued/running/applying/completed/failed, polling cleanup, React Flow canvas conversion, history invalidation); Step 2 generation controls + workspace blocker; auto-start on `?generateScenes=1`; extracted `StoryboardPlanControls`/`StoryboardPageWorkspace`/`StoryboardPageFooter` (StoryboardPage 290L)
- e2e: `storyboard-plan-scenes.spec.ts` (mocked plan, real apply, overlay gating, persisted graph/edge order)

## Stage 2 Storyboard Illustrations — STAGE2-ILLUSTRATIONS-1..5 + Autosave Fix (2026-05-14)
- added: migrations `038` (scene illustration jobs, statuses queued/running/ready/failed) + `039` (active-lock dedupe); `storyboardSceneIllustration.repository`
- added: illustration service/controller/routes (`GET/POST /storyboards/:draftId/illustrations`, `POST .../blocks/:blockId/illustration`); reuses `submitGeneration` + `beforeEnqueue` hook (durable mappings before fast worker); centralized defaults (`openai/gpt-image-2`, low quality, aspect-derived size); skips active/ready, retries failed; prevalidates all-scene prompts (no partial 422)
- added: output reconciliation marks jobs `ready`, inserts idempotent `storyboard_block_media` image row (`NOT EXISTS` guard); polling reconciles completed AI jobs; worker storage keys `ai-generations/{userId}/...`
- added FE: `useStoryboardIllustrations` (start/retry/status, polling, storyboard reload on attached outputs, stale guards); Step 2 illustration controls; `SceneBlockNode` per-block status badges + retry; Step 3 gated while queued/running
- fixed: status badges reapplied after reload; `useStoryboardCanvas.reload` stale-fetch guards
- e2e: `storyboard-illustrations.spec.ts` (lifecycle, gating, retry, thumbnails)
- fixed: `PUT /storyboards/:draftId` preserves `storyboard_scene_illustration_jobs` for retained blocks during full-replace

## Consistent Illustration Style Reference Pipeline — STYLE-REF-1..11 (2026-05-14)
- added: migration `040` (draft-level canonical reference mappings, source JSON, output link, active-draft lock) + `storyboardIllustrationReference.repository`
- added: shared `StoryboardOpenAIImageJobPayload`; API `storyboard-openai-image` queue; media-worker `processStoryboardOpenAIImageJob` (direct OpenAI Images `gpt-image-2` — `images.generate` text-only, `images.edit` referenced); `workerRepositories.ts` thin split; outputs marked `ready` immediately (own final PNG)
- changed: illustration service creates/reuses canonical reference before scene jobs (text-only→text-to-image; ready image refs→image-edit; video/audio ignored); 422 on missing/unlinked/not-ready refs; scene jobs gated until reference ready; sequential scene generation (scene 1 waits reference; later scenes wait reference + previous scene for continuity)
- changed: status response adds required `reference` object (status/jobId/outputFileId/sourceReferenceFileIds/errorMessage); FE tracks `status` + `phase` (reference vs scene), auto-continues after reference ready, copy "Creating visual style reference"/"Generating scene illustrations"
- added FE: canonical reference thumbnail preview in Step 2 control (`buildAuthenticatedUrl`, fallback states)
- e2e: reference-driven flow, failed-reference retry/recovery, multi-image reference merge

## Automated Storyboard Generation + Principal Image Approval — Subtask 1..7 (2026-05-21)
- changed: `startStoryboardPlan` reuses active queued/running job (transaction + `FOR UPDATE` draft lock); status adds `automation.phase` (idle/planning/creating_principal_image/awaiting_principal_approval/generating_scene_illustrations/ready/failed)
- added: migration `041` (`approval_status`/`approved_at` on canonical reference); ready principals default `pending`; bulk scene generation returns `awaiting_principal_approval` until approved; `POST .../illustrations/principal-image/approve`
- added: principal modal APIs — edit/regenerate (`gpt-image-2` image-edit), replace from ready draft image, set extra reference IDs; FE no auto-continue until `approvalStatus === 'approved'`
- changed: Step 2 auto-starts planning when canvas is exactly START+END (guarded by draft id + lifecycle); removed visible happy-path Generate buttons; failures show scoped Retry
- added FE: `PrincipalImageApprovalModal` (preview, regenerate, replacement picker, reference chips, approve-and-continue, focus trap, `objectFit: contain`); `AssetPickerModal` draft-scoped listing; `useAssets` media-type filtering for draft scope; Step 3 disabled until illustrations `completed`
- e2e: real principal approval gate, edit/replace/add-reference before approval

## Step 3 Storyboard Project Creation — STAGE3-PROJECT-1..7 (2026-05-22)
- added: migration `042` (`created_project_id`/`created_project_version_id` on `generation_drafts`); repository helpers (project/file-link/clip rows, mark complete; caller-provided `PoolConnection`)
- added: `storyboardGraph.service.ts` (reusable START→END ordering + sort-order fallback); pure `storyboardProjectDoc.service.ts` (ready scene outputs → validated image-clip `ProjectDoc`, 30fps rounding, aspect dims, no DB writes)
- added: `POST /storyboards/:draftId/project` + `storyboardProject.service.ts` (locks draft via `FOR UPDATE`, idempotent return of completion ids, validates ready/approved, creates project + file links + clips + version snapshot, marks complete); OpenAPI
- added FE: `createProjectFromStoryboard()`; `GenerateProjectFromStoryboardPage` on `/generate/road-map` (Strict Mode dedupe, retry, navigate `/editor?projectId=`); `StoryboardPage.handleNext` → `/generate/road-map?draftId=`
- e2e: `storyboard-project.spec.ts` (Step 3 gating, handoff, hydration, ordered clips, retry)

## Storyboard Step 3 LTX-2 Duration Mapping — STB-LTX-DUR-1..4 (2026-05-25)
- implemented: `buildStoryboardVideoOptions()` keeps `duration` enum/number when model exposes it, else derives `num_frames` from `durationS` (LTX-2 6s → `fps:25`, `num_frames:150`); `num_frames`+`frames_per_second` models clamped by min/max; extracted `storyboardVideoOptions.service.ts`
- added FE: `Step3GenerationModal` classifies duration behavior (direct duration / frame-count / none) with concise copy; generation enabled even without recognized control
- e2e: corrected `storyboard-project.spec.ts` stream mock to API `{ url }` JSON contract + signed image split

## Storyboard Step 3 Video Generation — STB-ADJ-1..8 (2026-05-25)
- added: `storyboard_scene_video_jobs` mapping table (active-job dedupe, model id, audio flag, status, output, error); storyboard video repository/controller/routes (`GET/POST /storyboards/:draftId/videos`)
- added: video orchestration service (validates draft ownership, image-to-video capability, principal-image approval, non-empty `videoPrompt`, ready illustration outputs, audio support; reuses `submitGeneration` with start image + optional next-scene `end_image_url` + provider audio/duration)
- changed: `POST /storyboards/:draftId/project` accepts `{ mode: 'images' | 'videos' }`; builds `VideoClip` timelines from ready scene video outputs; idempotent
- changed: scene plan requires `videoPrompt` (Image-to-Video motion prompt) alongside `prompt`/`visualPrompt`; planner prompt instructs motion/camera/depth/continuity; `storyboard_blocks.video_prompt` persistence; legacy plans derive `videoPrompt` from `visualPrompt` on read; scene modal `Image Prompt *` + `Video Prompt` textarea
- changed FE: drag state/dimming + `GhostDragPortal` full-size preview for scene/START/END; loader-only illustration status; Step 3 modal (image-to-video model select filtered to `image_to_video`, audio checkbox, skip routes to `mode=images`); `useStep3Generation` extracted; `GenerateProjectFromStoryboardPage` dedupes by draft+mode, polls video status with retry
- e2e: Step 3 skip + image-to-video + audio + failure-retry paths

## Storyboard Music Blocks (ElevenLabs Composition Plans) — STB-MUSIC-1..8 (2026-05-26)
- added: shared schemas for ElevenLabs Music composition plans/sections, music source modes, statuses, hydrated music blocks; storyboard plan schema v2 with `musicSegments` (scene-number ranges, default `generate_on_step3`); legacy v1→v2 normalization (empty music)
- added: migrations `storyboard_music_blocks` + `storyboard_music_generation_jobs` (active-lock); music repository (list/replace/update/lock/preserve/output-link); threaded `musicBlocks` through load/save/validation/full-replace/history; preserve on omit, preserve active jobs for retained ids, reject deleted-scene refs; OpenAPI
- added: planner prompts emit default `musicSegments` (instrumental, 1–3 cues, duration from covered scenes); plan-apply creates music blocks in same transaction (maps scene-number→block ids, `Music NN -` names, below scene row)
- added: media-worker ElevenLabs Music API (`POST /v1/music` compose, `POST /v1/music/plan`); composition-plan jobs compose to MP3 via Files-as-Root; prompt-only jobs create plan first (instrumental default), store resolved plan on `ai_generation_jobs.options`; catalog/validator/submit-guard for `composition_plan`
- added: storyboard music endpoints (`/storyboards/:draftId/music` list/update/generate-now/generate-pending); range validation by story order; existing ready-audio validation; active-lock only for queued/running; dedicated generation-job SQL repository
- changed: `buildStoryboardProjectDoc()` builds music audio track/clips from resolved blocks (start/duration from `orderStoryboardSceneBlocks`); supports existing audio + generated outputs; Step 3 blocks creation until music resolved; FE starts pending music, polls readiness (image + video modes)
- added FE: `MusicBlockNode` (source/status/range/preview); music inspector modal (Existing/Generate now/Auto later, audio-only picker, prompt, composition-plan summary, range selectors + mini-lane, volume/fade/loop/trim); scene covered-music indicators (graph-order derived); autosave/history serializes music nodes to `musicBlocks`; `StoryboardMusicBlockSaveInput` serializer excludes hydrated fields
- e2e: `storyboard-music.spec.ts` (auto-planned music, existing-track edit, generate-now, Step 3 auto-gen, image/video assembly, timeline audio hydration, scene-move range resolution)
- fixed: storyboard plan output normalization (wrapped `storyboard_plan`/`plan`, snake_case root/scene/music/composition-plan fields, camelCase); unwrap nested union validation errors to concrete paths; derive safe single-section instrumental plan when `sections` missing

## Storyboard Music Adjustments — STB-MUSIC-ADJ-1..6 (2026-05-26)
- added: manual Add Music toolbar action + `useAddMusicBlock` (UUID, `generate_on_step3`, first-to-last range, below-scene non-overlap placement, autosave override, history snapshot, immediate modal)
- changed: auto plan music placement aligns `positionX` to first covered scene, stacks lanes below scene row (lane height 132px, scene spacing 32px); shared `musicBlockLayout` constants for manual + auto
- changed: per-block prompt is source of truth; edited prompt + existing plan enqueues `/v1/music/plan` regeneration (`source_composition_plan`, `regenerate_composition_plan: true`, no `composition_plan`); promptless keeps plan-compose
- changed: `GhostDragPortal` renders inert `MusicBlockNode` ghost (aria-hidden, pointer-events off, `inert`); music drags create ghost/dim/restore/persist without altering scene edges
- changed: music modal backdrop centered
- e2e: manual add persistence, below-scene placement, per-block prompt routing, drag ghost, centered modal

## Bulk Stream URLs + WebSocket Realtime — BULK-WS-1..8 (2026-05-27)
- added: `POST /files/stream-urls` ({ fileIds } ≤100, dedupe, owned/non-deleted filter, `{ urls, missingFileIds }`); reuses single-file presign; OpenAPI
- added FE: `useBulkFileStreamUrls` (stable IDs, in-flight reuse, per-file + missing-ID cache, 14-min TTL under 15-min presign, mounted-consumer TTL expiry); `AssetThumbCard` optional `previewUrl`; used in MediaGalleryRecentBody, AssetPickerModal, StoryboardPage (scene/illustration/principal/reference surfaces), Step 3 assembly preload
- added: WebSocket transport — Node HTTP server + `/realtime` upgrade (preserves Express export); handshake auth (Bearer/query-token + dev bypass); typed subscribe/unsubscribe for draft storyboard + AI job; ownership enforced, bounded per-connection state, heartbeat; Redis pub/sub fanout on `cliptale:realtime:v1`
- added: API realtime publisher (queued/failed events from plan/illustration/video/music/AI submits); media-worker publisher (plan running/completed/failed, AI job processing/progress/completed/failed after DB writes); worker syncs video/music mappings to terminal states
- changed FE: replaced storyboard plan/illustration polling + Step 3 video/music wait loops with realtime subscriptions (browser subscription manager, shared socket, resubscribe on reconnect, one refresh on reconnect); `useJobPolling` refactored to `ai-job` subscription (snapshot + reconnect snapshot, no timed polling); `AiGenerationPanel` invalidates `['assets', projectId]` once per completed job
- fixed: API storyboard plan test fixtures expect normalized v2 plans (`musicSegments: []`); deterministic file soft-delete restore TTL (frozen clock); extracted shared plan fixtures; split `storyboardIllustration.service.ts` into config/types/validation/status/jobs helpers (≤300L)
- e2e: Playwright-local realtime WS mock (`mock-realtime.ts`); storyboard E2E driven by explicit status events; assert no single-file stream fallback

## Storyboard Real-Node Drag Preview — DND-1..4 (2026-05-29)
- implemented: removed `GhostDragPortal` clone from `StoryboardCanvas` — React Flow node itself is the only moving preview; controlled `dragging: true` position changes update canvas state without history/autosave; `dragging: false` persists in `handleNodeDragStop`
- implemented: grey/restore original node for scene/music/START/END; scene edge midpoint auto-insert remains scene-only; drop snapshots use final edge set
- fixed: split `useStoryboardDrag.helpers.ts` (≤300L); removed dead drag-preview prop threading; deleted dead `GhostDragPortal` + test
- e2e: scene/music/START/END drags never render `ghost-drag-clone`; stable DOM identity, unchanged dims during drag, post-mouseup position match; PUT saves actual dropped coords

## Architectural Decisions
- §9.7 300-line cap exceptions: `fal-models.ts` (1093L), `file.repository.ts` (306L), `useProjectInit.test.ts` (318L), `StoryboardCard.tsx` (319L), `storyboard-store.ts` (307L), `StoryboardPage.tsx` (351L approved); e2e/*.spec.ts exempt
- Worker env: only `index.ts` reads config keys; handlers receive secrets via `deps`
- Migration runner: in-process + sha256; DDL non-transactional; INSERT after DDL
- Vitest: `pool: 'forks' + singleFork: true`; each split file has own `vi.hoisted()`
- Files-as-root: `files` user-scoped; `project_files`/`draft_files` pivots (CASCADE container, RESTRICT file)
- Soft-delete: `deleted_at IS NULL`; `*IncludingDeleted` helpers; 30-day TTL → GoneError 410
- mysql2: `pool.query` (not `execute`) for LIMIT params; JSON cols need `typeof==='string'` guard
- Auth: `buildAuthenticatedUrl()` required on all `/assets/:id/{thumbnail,stream}` media elements
- Store reset: `resetProjectStore + resetHistoryStore` BEFORE `fetchLatestVersion`
- `CanvasSnapshot.positions` optional — falls back to `block.positionX/Y`
- Typography §3: 14/400 body, 12/500 label, 16/600 heading-3; 4px grid; radius-md 8px
- Per-file styles: hex constants at top of `.styles.ts`; no CSS custom properties in web-editor
- E2E CORS: `page.route()` proxy; PUT uses `page.request.put`; run with `E2E_BASE_URL` + `E2E_API_URL`
- Storyboard autosave: reads React state via params+refs, NOT external store subscription
- Storyboard IDs: always `crypto.randomUUID()` — server schema requires UUID
- Immediate save: `setTimeout(() => void saveNow(), 0)` defers until after React re-render
- Sentinel init: `loadStoryboard` auto-initializes atomically; `dedupSentinels()` client-side safety net
- Auto-restore skip-save: `handleRestore({ skipSave: true })` in seed path; manual restore calls saveNow
- React Flow two-state rule: `setNodes` must always be called — external store alone does not update canvas
- Drag preview (DND): React Flow node itself is the moving preview; no ghost clone; `dragging:true` updates canvas only; `handleNodeDragStop` is sole persist path
- Knife mode: `useStoryboardKnifeTool` — Ctrl/Meta alone activates; any non-modifier deactivates; `cutEdge` atomic
- Storyboard plan schema v2: `musicSegments`; legacy v1 normalizes to v2 with empty music; worker normalizes OpenAI snake/camelCase variants before validation
- Illustration pipeline: canonical reference (draft-level) created before sequential scene generation; ready principal defaults `pending` approval; scenes gated until reference ready + approved
- Music: per-block `prompt` is source of truth; edited prompt + plan → `/v1/music/plan` regeneration; instrumental default; music ranges resolved by `orderStoryboardSceneBlocks` (graph order, not canvas position)
- html-to-image: `imagePlaceholder` prevents CORS rejection; `crossOrigin="anonymous"` on `<img>`; `getBoundingClientRect()` source size + `canvasWidth/canvasHeight` output; normalized in-memory resource cache
- Realtime: `/realtime` WS upgrade on Node HTTP server (Express export preserved); Redis fanout `cliptale:realtime:v1`; browser shares one socket, resubscribes + one refresh on reconnect; replaces storyboard/Step 3/AI-job polling
- Bulk stream URLs: `POST /files/stream-urls` (≤100 ids); FE cache 14-min TTL under 15-min presign expiry
- E2E history panel: React Query caches history GET 30s; reload after POST /history before asserting

## Known Issues / TODOs
- ACL middleware stub — real ownership check deferred
- `bytes` NULL after ingest (HeadObject needs worker bucket config)
- Lint fails — ESLint v9 config-migration error workspace-wide
- web-editor `npm run typecheck` blocked by pre-existing unrelated test/type debt (App/timeline/asset-manager/version-history/shared-ai-generation/config fixtures, e.g. `App.PreviewSection.test.tsx`/`App.RightSidebar.test.tsx` missing `UseRemotionPlayerResult`/`EphemeralState` `volume`/`isMuted`)
- Stitch OQ-S1..S4 (dup Landing, tablet/mobile, secondary screens, spacing echo)
- Infinite scroll: BE pagination shipped; FE `fetchNextAssetsPage()` unwired
- `parseStorageUri` duplicated across asset.service + file.service
- `linkFileToProject` duplicated across timeline/api.ts + shared/file-upload/api.ts
- Hard-purge cron for soft-deleted rows past 30 days not implemented
- E2E image/audio timeline-drop tests skip when no assets linked to test project
- `initializeStoryboard` service function orphaned — remove or deprecate
- `e2e/storyboard-canvas.spec.ts` + `e2e/storyboard-drag.spec.ts` — should use `e2e/helpers/cors-workaround.ts`
- SB-HIST-THUMB crossOrigin risk: if `APP_CORS_ORIGIN` mismatches app origin, images may fail; revert `crossOrigin` on SceneBlockNode if so
- Local E2E runs frequently blocked by login rate-limit (429) / seed-auth 401 / port 3001 connection resets; workaround: restart API container or use clean API on alt port + reseed `seed-test-user.sql`

---

## [2026-06-16]

### Task: seedance2-video-models — Seedance 2 Image-to-Video + Reference-to-Video
**Subtask:** 1. Зафіксувати точні fal.ai endpoint-ID та схеми полів Seedance 2

**What was done:**
- Fetched fal.ai docs via WebFetch for all Seedance 2.0 endpoints (no fal-ai MCP available this session).
- Confirmed two endpoints relevant to this task: `bytedance/seedance-2.0/image-to-video` and `bytedance/seedance-2.0/reference-to-video`.
- Documented full input field schemas for both (see Notes below for subtask 2 to consume).
- No code files modified (research-only subtask).

**Notes — schema for subtask 2:**

**Endpoint 1 — `bytedance/seedance-2.0/image-to-video`**
Source: https://fal.ai/models/fal-ai/seedance-2/image-to-video/api
API call string: `fal.subscribe("bytedance/seedance-2.0/image-to-video", {...})`

Fields:
- `prompt` — type text, required, modality text. "Text prompt describing desired motion/action."
- `image_url` — type image_url, required, modality image. "Starting frame image. JPEG/PNG/WebP, max 30 MB."
- `end_image_url` — type image_url, optional, modality image. "Final frame for transition. JPEG/PNG/WebP, max 30 MB."
- `resolution` — type enum, optional, default "720p", enum ["480p","720p","1080p"]. "Video resolution."
- `duration` — type enum, optional, default "auto", enum ["auto","4","5","6","7","8","9","10","11","12","13","14","15"]. "Duration in seconds."
- `aspect_ratio` — type enum, optional, default "auto", enum ["auto","21:9","16:9","4:3","1:1","3:4","9:16"]. "Aspect ratio."
- `generate_audio` — type boolean, optional, default true. "Generate synchronized audio (SFX, ambient, lip-sync)."
- `bitrate_mode` — type enum, optional, default "standard", enum ["standard","high"]. "Output bitrate mode."
- `seed` — type number, optional. "Random seed for reproducibility."

Output: `{ video: File, seed: integer }` — File has `url`, `content_type`, `file_name`, `file_size`.

---

**Endpoint 2 — `bytedance/seedance-2.0/reference-to-video`**
Source: https://fal.ai/models/fal-ai/seedance-2/reference-to-video/api
API call string: `fal.subscribe("bytedance/seedance-2.0/reference-to-video", {...})`

Fields:
- `prompt` — type text, required, modality text. "Describes generation; reference assets as @Image1, @Image2, @Video1, @Audio1 etc."
- `image_urls` — type image_url_list, optional, modality image. "Up to 9 reference images; JPEG/PNG/WebP, max 30 MB each." ← THIS is the reference-array field (NOT `reference_image_urls`, NOT `image_url`)
- `video_urls` — type string_list (or image_url_list equivalent for video), optional. "Up to 3 reference videos; MP4/MOV; combined 2-15 sec." (catalog: out of scope for Phase 1 — omit or add as string_list)
- `audio_urls` — type string_list, optional. "Up to 3 audio files; MP3/WAV; max 15 MB each, combined ≤15 sec." (catalog: out of scope for Phase 1 — omit or add as string_list)
- `resolution` — type enum, optional, default "720p", enum ["480p","720p","1080p"]. "Video resolution."
- `duration` — type enum, optional, default "auto", enum ["auto","4","5","6","7","8","9","10","11","12","13","14","15"]. "Duration in seconds."
- `aspect_ratio` — type enum, optional, default "auto", enum ["auto","21:9","16:9","4:3","1:1","3:4","9:16"]. "Aspect ratio."
- `generate_audio` — type boolean, optional, default true. "Generate synchronized audio."
- `bitrate_mode` — type enum, optional, default "standard", enum ["standard","high"]. "Output bitrate mode."
- `seed` — type number, optional. "Random seed for reproducibility."

Output: `{ video: File, seed: integer }` — same File shape as above.

**IMPORTANT for subtask 2:**
- Only `prompt` is required for reference-to-video (unlike image-to-video which also requires `image_url`). The `image_urls` field is optional per the API, but UI-wise the Creator needs at least one reference image to make useful calls.
- The reference image-array field is named `image_urls` (plural, with underscore) — maps to `FalFieldType = 'image_url_list'` with `modality: 'image'`. This already exists in the catalog type system (`nano-banana-2/edit` and `gpt-image-1.5/edit` both use `image_url_list` type).
- The `video_urls` and `audio_urls` fields are multi-modal reference inputs. The task context says to model reference-to-video via `image_url_list` only (storyboard reference blocks are images). `video_urls` / `audio_urls` can be omitted from the catalog entry for now (they remain passable by advanced callers who know the API).
- The `end_user_id` field exists on both endpoints but should be omitted from the catalog (it is injected by the worker/service layer, not user-provided).
- Duration enum values on fal.ai are strings ("4", "5", ...) NOT integers — match existing pattern in Kling o3 (`enum: ['3','4',...,'15']`).
- Aspect ratio includes "21:9" and "3:4" which are not in all other models — include them.

**Confirmed:** reference-to-video variant EXISTS as a distinct endpoint (not ambiguous). No blocker.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: 1. Зафіксувати точні fal.ai endpoint-ID та схеми полів Seedance 2</summary>

- [ ] **1. Зафіксувати точні fal.ai endpoint-ID та схеми полів Seedance 2**
  - What: Через `WebFetch` отримати з docs fal.ai реальні endpoint-ID (image-to-video та reference-to-video варіанти Seedance 2 від ByteDance) і повні схеми вхідних полів — назви, типи, enum-значення, defaults, required.
  - Where: Дослідницький крок; результат → нотатки/чернетка для підзадачі 2 (модель-ендпоінти на кшталт `fal-ai/bytedance/seedance/v2/...`).
  - Why: Каталог має дзеркалити реальне API fal.ai; неточні поля зламають валідацію або сабміт у воркері.
  - Depends on: none
  - ⚠️ Блокер точності — якщо docs не дають reference-to-video варіант або поля неоднозначні, ескалювати до власника (див. Open Questions).

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-06-16. Research/docs-only subtask — no code files modified, no UI surface. All design checklists N/A. Auto-approved.
checked by playwright-reviewer: YES

---

## 2026-06-16

### Task: seedance2-video-models — Seedance 2 Image-to-Video + Reference-to-Video
**Subtask:** 2. Додати два записи Seedance 2 у каталог `FAL_MODELS`

**What was done:**
- Added entry `bytedance/seedance-2.0/image-to-video` (entry #11) to `FAL_MODELS` with fields: `prompt` (text, required), `image_url` (image_url, required), `end_image_url` (image_url, optional), `resolution` (enum), `duration` (enum), `aspect_ratio` (enum), `generate_audio` (boolean), `bitrate_mode` (enum), `seed` (number).
- Added entry `bytedance/seedance-2.0/reference-to-video` (entry #12) to `FAL_MODELS` with fields: `prompt` (text, required), `image_urls` (image_url_list, required — marked required in catalog per UI enforcement policy despite optional in raw API), `resolution` (enum), `duration` (enum), `aspect_ratio` (enum), `generate_audio` (boolean), `bitrate_mode` (enum), `seed` (number).
- Both entries: `capability: 'image_to_video'`, `group: 'videos'`, `provider: 'fal'`.
- Updated header comment in `fal-models.ts`: `length 9` → `length 12` (header was stale at "9", actual was 10 before this subtask).
- All media fields carry correct `modality` (`image_url`/`image_url_list` → `'image'`; `text` → `'text'`).
- TypeScript compilation: zero errors (`tsc --noEmit` clean).

**Files modified:**
- `packages/api-contracts/src/fal-models.ts`

**Notes:**
- `image_urls` on `reference-to-video` is `required: true` in the catalog (per task decision) even though the fal.ai API marks it optional — enforces ≥1 reference image at the UI/validator level.
- Duration enum values are strings ("auto","4","5",...,"15") consistent with Kling o3 pattern.
- Aspect ratio includes "21:9" and "3:4" (Seedance 2 supports wider set than other i2v models).
- `end_user_id` intentionally omitted (worker-injected, not user-provided).
- `video_urls` / `audio_urls` intentionally omitted (Phase 1 images-only scope).
- Count-assertion tests (`fal-models.test.ts`, `elevenlabs-models.test.ts`) will fail until subtask 4 updates the counters — expected, not fixed here per task instructions.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: 2. Додати два записи Seedance 2 у каталог FAL_MODELS</summary>

- [ ] **2. Додати два записи Seedance 2 у каталог `FAL_MODELS`**
  - What: Додати дві моделі (`capability: 'image_to_video'`, `group: 'videos'`, `provider: 'fal'`) з повними `inputSchema.fields` зі схем підзадачі 1; reference-варіант використовує `image_url_list` (`modality: 'image'`) для референс-зображень, image-варіант — `image_url`. Кожне текстове поле — `modality: 'text'`.
  - Where: `packages/api-contracts/src/fal-models.ts`.
  - Why: Реєструє моделі в єдиному джерелі правди для UI/валідації/воркера.
  - Depends on: 1

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-06-16. No UI surface modified. Subtask added two model entries (bytedance/seedance-2.0/image-to-video, bytedance/seedance-2.0/reference-to-video) to packages/api-contracts/src/fal-models.ts — pure data catalog additions (id, label, capability, inputSchema.fields). No JSX, CSS, style tokens, spacing, typography, or layout changes. Existing rendering components (GenerationOptionsForm, SchemaFieldInput, image_url_list) are unchanged. Design checklist not applicable.
checked by playwright-reviewer: YES

## 2026-06-16

### Task: seedance2-video-models — Seedance 2 Image-to-Video + Reference-to-Video
**Subtask:** 3. Додати ціни Seedance 2 у `FLOW_PRICE_TABLE`

**What was done:**
- Added two price entries to `FLOW_PRICE_TABLE` in `apps/api/src/lib/flow-pricing.ts`, placed in the fal.ai image-to-video section immediately after the existing four i2v rows.
- Keys match the exact `id` values registered in `fal-models.ts` (subtask 2): `bytedance/seedance-2.0/image-to-video` and `bytedance/seedance-2.0/reference-to-video`.
- Prices set to conservative USD estimates: `0.20` (i2v) and `0.25` (reference-to-video), each annotated with an `// approximate` inline comment noting no public per-run price was available at 2026-06-16.
- TypeScript compilation: `tsc --noEmit --skipLibCheck` passes with zero errors.

**Files modified:**
- `apps/api/src/lib/flow-pricing.ts`

**Notes:**
- Pricing convention followed: per-run USD float, `// approximate — ...` inline comment for unverified prices, consistent with ADR-0008 best-effort seed/fallback pattern.
- Reference-to-video priced slightly higher (0.25 vs 0.20) to reflect multi-image reference processing overhead; conservative relative to Kling o3 (0.28) and PixVerse (0.35).
- No tests exist for this file in the codebase; the `getPriceForModel` function is exercised indirectly by flow-model-pricing tests if any.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: 3. Додати ціни Seedance 2 у FLOW_PRICE_TABLE</summary>

- [ ] **3. Додати ціни Seedance 2 у `FLOW_PRICE_TABLE`**
  - What: Додати два ключі (за `id` моделей) з best-effort USD-цінами у секцію fal.ai image-to-video.
  - Where: `apps/api/src/lib/flow-pricing.ts`.
  - Why: Без ціни сервіс віддає amount 0 / bestEffort; коректний seed узгоджує `flow_model_pricing` fallback.
  - Depends on: 2

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-06-16. Backend-only subtask — sole modified file is apps/api/src/lib/flow-pricing.ts (two numeric constant rows added to FLOW_PRICE_TABLE). No JSX, CSS, style tokens, spacing, typography, or layout changes. Design checklist not applicable. Auto-approved.
checked by playwright-reviewer: YES — backend-only change; git diff confirms only apps/api/src/lib/flow-pricing.ts + docs touched; no UI component, route, or page modified; no E2E required per mandate

## 2026-06-16

### Task: seedance2-video-models — Seedance 2 Image-to-Video + Reference-to-Video
**Subtask:** 4. Оновити тести каталогу під нові лічильники та інваріанти

**What was done:**
- Updated `fal-models.test.ts`: count assertion `toHaveLength(10)` → `toHaveLength(12)` (line 7).
- Added targeted test in `fal-models.test.ts`: "seedance-2 reference-to-video has an image_url_list field named image_urls" — asserts the field exists, type is `image_url_list`, `required: true`, and `modality: 'image'`.
- Updated `elevenlabs-models.test.ts` AI_MODELS total: `toHaveLength(14)` → `toHaveLength(16)` (line 176).
- Updated `elevenlabs-models.test.ts` fal-models count in discriminate test: `toHaveLength(10)` → `toHaveLength(12)` (line 187).
- Verified `catalog-modality.test.ts` — exhaustive modality backfill + field-type correctness iterate over all FAL_MODELS; new Seedance 2 entries (both have correct `modality` on all media fields) pass all invariants without changes to the test file.
- Full vitest run: **224 tests, 11 test files — all passed** (0 failures).

**Files modified:**
- `packages/api-contracts/src/fal-models.test.ts`
- `packages/api-contracts/src/elevenlabs-models.test.ts`

**Notes:**
- `catalog-modality.test.ts` required no edits — its tests are iterate-all and inherently cover new models; both Seedance 2 entries satisfy all modality invariants.
- New targeted test lives in the `fal-models catalog` describe block, grouped with other model-specific field-shape tests.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: 4. Оновити тести каталогу під нові лічильники та інваріанти</summary>

- [ ] **4. Оновити тести каталогу під нові лічильники та інваріанти**
  - What: Підняти `fal-models.test.ts` `toHaveLength(10 → 12)`; `elevenlabs-models.test.ts` `AI_MODELS` 14→16 та fal-models 10→12. Переконатися, що нові моделі задовольняють `catalog-modality.test.ts` (modality на кожному media-полі) та інваріанти required/unique-id. За потреби додати точковий тест на reference-модель (наявність `image_url_list`-поля).
  - Where: `packages/api-contracts/src/fal-models.test.ts`, `elevenlabs-models.test.ts`, `catalog-modality.test.ts`.
  - Why: Лічильники захардкоджені — без оновлення suite червоніє; інваріанти гарантують коректну поведінку canvas/валідації.
  - Depends on: 2

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-06-16. No UI surface modified — only test files (fal-models.test.ts, elevenlabs-models.test.ts). Design review not applicable; auto-approved.
checked by playwright-reviewer: YES — test-only change; git diff confirms only fal-models.test.ts and elevenlabs-models.test.ts touched (count assertions + one new targeted field-shape test); no UI component, route, page, or style modified; no E2E required per mandate

---

## [2026-06-16]

### Task: seedance2-video-models — Seedance 2 Image-to-Video + Reference-to-Video
**Subtask:** 5. Верифікувати downstream-споживачів end-to-end (без змін коду)

**What was done:**
- Read-only verification pass across all 5 downstream consumers; confirmed no hidden per-modelId assumptions.
- No code changes were made. All verification is evidence-based (file:line references below).

**Evidence per verification point:**

**(а) listModels() in aiGeneration.service.ts:**
- `apps/api/src/services/aiGeneration.service.ts` lines 284–299: `listModels()` iterates ALL `AI_MODELS` in a single loop `for (const model of AI_MODELS) { grouped[model.capability].push(model); }`. The `image_to_video` key is pre-declared at line 289. No allowlist, no per-modelId guard. Both Seedance 2 models (capability = `image_to_video`) will appear under the `image_to_video` key automatically.

**(б) validateFalOptions in falOptions.validator.ts:**
- `apps/api/src/services/falOptions.validator.ts` lines 60–139: `checkField()` switch handles all relevant types: `text` (line 62), `enum` (line 87), `number` (line 68), `boolean` (line 80), `image_url` (line 96), `image_url_list` (lines 102–113). The `image_url_list` branch validates `Array.isArray(value) && every(v => string)`. Seedance-2 i2v payload (prompt=text, image_url=image_url, resolution=enum, duration=enum, aspect_ratio=enum, generate_audio=boolean, bitrate_mode=enum, seed=number) and reference-to-video payload (prompt=text, image_urls=image_url_list, ...) are fully covered by existing branches without any new code.

**(в) parseFalOutput in ai-generate.output.ts:**
- `apps/media-worker/src/jobs/ai-generate.output.ts` lines 54–74: `parseFalOutput()` branches on `capability` (NEVER on `modelId`). Line 69: `if (capability === 'text_to_video' || capability === 'image_to_video') { return parseVideoOutput(capability, o); }`. Both Seedance 2 models have `capability: 'image_to_video'` → `parseVideoOutput` is called automatically. Parser expects `{ video: { url, width?, height?, duration? } }` shape.

**(г) storyboardVideo.service.ts gate:**
- `apps/api/src/services/storyboardVideo.service.ts` lines 57–66: `getModel()` does `AI_MODELS.find(candidate => candidate.id === modelId)` then checks `model.capability !== 'image_to_video'` and throws if not i2v. Both Seedance 2 models have `capability: 'image_to_video'` → they pass the gate. No modelId allowlist exists.

**(д) GenerationOptionsForm.tsx / SchemaFieldInput.tsx:**
- `apps/web-editor/src/shared/ai-generation/components/GenerationOptionsForm.tsx` lines 29–56: iterates `model.inputSchema.fields` and renders one `SchemaFieldInput` per entry. Comment at line 24 explicitly documents "no per-model `if (modelId === 'x')` branches." Zero changes needed.
- `apps/web-editor/src/shared/ai-generation/components/SchemaFieldInput.tsx` lines 52–63: `image_url_list` case renders `<AssetPickerField mode="multi" .../>`. The `image_urls` field on the reference-to-video model (type `image_url_list`, modality `image`) will render correctly as a multi-image picker. The `default` exhaustiveness guard at line 272 (`_exhaustive: never`) confirms no unhandled types.

**Hidden assumptions found:** NONE. Every downstream consumer branches by capability or iterates the entire catalog. No hardcoded modelId, no `.find` assuming exactly one i2v model, no single-image-only path that would break on `image_url_list`.

**Notes:**
- 3 failing tests in `StepCorners.test.tsx` are pre-existing, unrelated to Seedance models (they test StepCorners confirmation modal behavior from the storyboard-pipeline feature). They fail before and after this subtask.
- api-contracts tests: 224/224 pass. web-editor: 3235/3238 pass (3 pre-existing StepCorners failures).

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: 5. Верифікувати downstream-споживачів end-to-end (без змін коду)</summary>

- [ ] **5. Верифікувати downstream-споживачів end-to-end (без змін коду)**
  - What: Підтвердити, що нові моделі: (а) повертаються у `listModels()` під ключем `image_to_video`; (б) проходять `validateFalOptions` для типового payload; (в) парсяться `parseFalOutput` як відео; (г) проходять гейт `storyboardVideo.service` (`capability === 'image_to_video'`); (д) рендеряться у `GenerationOptionsForm`/`SchemaFieldInput` (зокрема `image_url_list` на reference-моделі) і дають типізовані handle-и на canvas. Якщо десь виявиться приховане припущення «рівно одна image_to_video модель з одним image_url» — задокументувати й виправити.
  - Where: read/verify across `aiGeneration.service.ts`, `falOptions.validator.ts`, `ai-generate.output.ts`, `storyboardVideo.service.ts`, `SchemaFieldInput.tsx`; запустити vitest з `apps/web-editor` та пакетні тести.
  - Why: Рішення «reuse image_to_video» ґрунтується на тому, що весь downstream гілкується за capability; крок 5 це доводить фактично, а не на віру.
  - Depends on: 2, 3, 4

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-06-16. Subtask 5 (seedance2-video-models) is verification-only — no UI components, styles, spacing, color tokens, or layout were created or modified. All referenced files (aiGeneration.service.ts, falOptions.validator.ts, ai-generate.output.ts, storyboardVideo.service.ts, SchemaFieldInput.tsx) are backend service logic or existing UI rendering infrastructure with zero design-surface changes. Design review not applicable; marking YES.
checked by playwright-reviewer: YES — verification-only subtask; git diff confirms zero changes to any file under apps/web-editor/src/ (GenerationOptionsForm.tsx and SchemaFieldInput.tsx untouched); only fal-models.ts catalog data, pricing table, test count assertions, and docs were modified; no UI component added or modified, no E2E required per mandate
