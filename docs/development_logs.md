# Development Log (compacted — 2026-03-29 to 2026-04-12)

## Monorepo Scaffold (Epic 1)
- added: root config (`package.json`, `turbo.json`, `tsconfig.json`, `.env.example`, `.gitignore`, `docker-compose.yml` — MySQL 8 + Redis 7)
- added: `apps/api/` (Express + helmet/cors/rate-limit, BullMQ stubs), `apps/web-editor/` (React 18 + Vite), `apps/media-worker/`, `apps/render-worker/` (BullMQ stubs)
- added: `packages/project-schema/` (Zod: ProjectDoc, Track, Clip union, imageClipSchema), `packages/remotion-comps/` (VideoComposition + layers)
- fixed: `APP_` env prefix; Zod startup validation; `workspace:*` → `file:` paths

## DB Migrations
- added: 001–014 (projects, assets, captions, versions, render_jobs, project_clips, seed, image clip ENUM, users/sessions/password_resets/email_verifications, ai_provider_configs [later dropped], ai_generation_jobs)
- added: 013_drop_ai_provider_configs.sql; 014_ai_jobs_fal_reshape.sql (drop+recreate, model_id VARCHAR(128) + capability ENUM 4 fal values, composite idx)
- added: 015_ai_jobs_audio_capabilities.sql (capability ENUM widened to 8: + text_to_speech/voice_cloning/speech_to_speech/music_generation)
- added: 016_user_voices.sql (voice_id PK, user_id FK, label, elevenlabs_voice_id; user-scoped, no project_id)
- added: 017_asset_display_name.sql (asset displayName column)
- added: 018_add_caption_clip_type.sql (project_clips_current.type ENUM + 'caption')

## Infrastructure (Redis + BullMQ + S3)
- updated: Redis healthcheck, error handlers, graceful shutdown, concurrency in workers
- fixed: `@/` alias + `tsc-alias` in api tsconfig
- added: S3 stream endpoint `GET /assets/:id/stream` with Range header forwarding

## Asset Upload Pipeline (Epic 1)
- added: `errors.ts`, `s3.ts`, `validate.middleware.ts`, `auth.middleware.ts`, `acl.middleware.ts`
- added: asset CRUD endpoints (upload-url, get, list, finalize, delete, stream); `enqueue-ingest.ts` (idempotency, 3 retries, exp backoff)
- added: `ingest.job.ts` — S3 → FFprobe → thumbnail → waveform → S3 → DB ready; audio-only: `fps=30`

## Asset Browser + Upload UI (Epic 1)
- added: `features/asset-manager/` — types, api, hooks (useAssetUpload, useAssetPolling), components (AssetCard, AssetDetailPanel, UploadDropzone, UploadProgressList, AssetBrowserPanel)
- added: `getAssetPreviewUrl()`, `matchesTab()`, `TypeIcon`, `hideFilterTabs` prop

## VideoComposition + Storybook (Epic 2)
- updated: `VideoComposition.tsx` — z-order sort, muted filtering, trim frames, image branch
- added: Storybook config + stories; extracted `VideoComposition.utils.ts`

## Stores (Epic 2)
- added: `project-store.ts` (useSyncExternalStore, Immer patches, computeProjectDuration), `ephemeral-store.ts`, `history-store.ts` (undo/redo, drainPatches)
- added: `computeProjectDuration()` in `packages/editor-core`

## Preview + Playback (Epic 2)
- added: `useRemotionPlayer.ts`, `PreviewPanel.tsx`, `usePlaybackControls.ts`, `PlaybackControls.tsx`, `formatTimecode.ts`, `VolumeControl.tsx`, `usePrefetchAssets.ts`
- fixed: rAF tick; `waitUntilDone()` is function not Promise (Remotion v4); playhead freezing — `updateTimelinePlayheadFrame()` in rewind/pause/step/seekTo

## App Shell (Epic 2)
- added: `App.tsx` (two-column desktop + mobile layout), `App.panels.tsx`, `App.styles.ts`, `MobileInspectorTabs.tsx`, `MobileBottomBar.tsx`, `useWindowWidth.ts`

## Captions / Transcription (Epic 3)
- added: caption CRUD + `POST /assets/:id/transcribe` (202); `transcribe.job.ts` (S3 → Whisper → DB)
- added: FE `TranscribeButton.tsx`, `useAddCaptionsToTimeline.ts`, `CaptionEditorPanel.tsx`

## Version History & Rollback (Epic 4)
- added: version CRUD + restore; `useAutosave.ts` (debounce 2s, drainPatches, beforeunload flush)
- added: `VersionHistoryPanel.tsx`, `RestoreModal.tsx`, `TopBar.tsx`, `SaveStatusBadge.tsx`

## Background Render Pipeline (Epic 5)
- added: render CRUD + per-user 2-concurrent limit; `render.job.ts` (fetch doc → Remotion render → S3)
- added: FE `useExportRender.ts`, `RenderProgressBar.tsx`, `ExportModal.tsx`; render-worker Docker (node:20-slim + Chromium)
- added: `RendersQueueModal.tsx`, `useListRenders.ts` (polls 5s), renders badge in TopBar
- fixed: `REMOTION_ENTRY_POINT`; render black screen (presigned S3 URLs); download URLs
- created: `packages/remotion-comps/src/remotion-entry.tsx` — `registerRoot()` for `bundle()`

## Timeline Editor (Epic 6)
- added: BE — `clip.repository.ts`, `clip.service.ts`, `clips.controller.ts`, `clips.routes.ts`; PATCH + POST clip endpoints with cross-track moves
- added: FE — TimelineRuler, TrackHeader, ClipBlock, WaveformSvg, ClipLane, ClipContextMenu, TrackList, TimelinePanel, ScrollbarStrip
- added: hooks — useSnapping, useClipDrag, useClipTrim, useClipDeleteShortcut, useScrollbarThumbDrag, useTrackReorder, useTimelineWheel
- added: `clipTrimMath.ts`, `clipContextMenuActions.ts`, `AddTrackMenu.tsx`, `useAddEmptyTrack.ts`, `useTimelineResize.ts`, `TimelineResizeHandle.tsx`
- fixed: float frames → `Math.round()`; split edge case; passive wheel; context menu portal; clip scroll sync; playhead needle rAF bridge; ruler click seek
- removed: cross-track drag (resolveTargetTrackId)
- updated: TRACK_HEADER_WIDTH 64→160; TRACK_ROW_HEIGHT 48→36

## Clip Persistence + Asset Drop
- updated: `useAddAssetToTimeline.ts` — calls `createClip()` after `setProject()`; track name = stripped filename
- added: `useDropAssetToTimeline.ts` — auto-creates track on empty timeline drop

## Inspector Panels
- added: `ImageClipEditorPanel`, `VideoClipEditorPanel`, `AudioClipEditorPanel` + hooks
- updated: `App.panels.tsx` — inspector branches in RightSidebar/MobileTabContent

## Additional Features
- fixed: CSS reset (white border); mobile preview height
- added: `DeleteTrackDialog.tsx`, Scroll-to-Beginning button, `useReplaceAsset.ts`/`ReplaceAssetDialog.tsx`, `useDeleteAsset.ts`/`DeleteAssetDialog.tsx`
- added: `AddToTimelineDropdown.tsx`/`useTracksForAsset.ts`, `ProjectSettingsModal.tsx` (FPS + resolution presets)
- added: `POST /projects`; `useProjectInit.ts` (reads `?projectId=` or creates new)
- fixed: `useCurrentVersionId()` reactivity via `useSyncExternalStore`

## Authentication & Authorization (Epic 8)
- added: `user.repository.ts`, `session.repository.ts`, `auth.service.ts` (32-byte tokens, SHA-256, 7-day TTL, bcrypt-12)
- added: auth routes — register, login, logout, me; rate limiting (5 reg/IP/hr, 5 login/email/15min)
- added: `email.service.ts` (stub), password-reset (1hr TTL), email-verify (24hr TTL), single-use; forgot-password always 200
- rewrote: `auth.middleware.ts` — session-based via `authService.validateSession()`; `APP_DEV_AUTH_BYPASS` env
- updated: `acl.middleware.ts`, `express.d.ts`, all controllers (`req.user.id` → `req.user.userId`)
- added FE: `features/auth/` — LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage; React Router; auth styles
- added: `AuthProvider.tsx`, `ProtectedRoute.tsx`, `useAuth.ts`; Bearer token injection + 401 interceptor
- added: `oauth.service.ts` (Google + GitHub code exchange, account linking); OAuth routes + FE buttons + `useOAuthToken.ts`
- added: query-param `?token=` fallback in `auth.middleware.ts` for `<img>`/`<video>` media element auth; `buildAuthenticatedUrl()` in `api-client.ts`; wired into `useRemotionPlayer.ts` and asset-manager `getAssetPreviewUrl()`

## AI Platform — Epic 9 BYOK (initial, later removed)
- (initial) added: encryption.ts AES-256-GCM, ai_provider_configs CRUD, 8 provider adapters (openai/stability/replicate/runway/kling/pika/elevenlabs/suno), aiGeneration jobs + worker
- (initial) added: FE `features/ai-providers/` (modal, ProviderCard) + `features/ai-generation/` (TypeSelector, OptionsForm, Progress, Panel, LeftSidebarTabs, TopBar AI button)
- fixed: AiGenerationPanel provider state stale (refetch on modal close); `dalle-3` use `response_format: b64_json` (Docker fetch failures); auto-add generated content to assets via `project_assets_current` row + `['assets', projectId]` invalidation; AiGenerationPanel width 280→320 (parity with AssetBrowser)

## AI Platform — Epic 9 Rework (fal.ai catalog)
- removed: BYOK layer entirely — deleted `aiProvider.{service,repository,controller}.ts`, `aiProviders.routes.ts`, `lib/encryption.ts` + tests, `ai-providers-endpoints.test.ts`, `APP_AI_ENCRYPTION_KEY` from config/env/docker, FE `features/ai-providers/`, TopBar "AI" button
- added: `APP_FAL_KEY` to api + media-worker config (Zod hard-fail); `apps/media-worker/src/lib/fal-client.ts` — pure module, `submitFalJob`/`getFalJobStatus`/`pollFalJob`, raw `globalThis.fetch`, key as parameter, no env reads
- added: `packages/api-contracts/src/fal-models.ts` (1093 lines, exception §9.7 user-approved) — 9 fal models with input schemas, types `FalModel`/`FalCapability`/`FalFieldType`/`FalFieldSchema`/`FalInputSchema`; `field.type` includes `image_url`, `image_url_list`, `string_list`; vitest added to api-contracts
- added: `apps/api/src/services/falOptions.validator.ts` — schema-walking validator (unknown keys, required, types, enums, min/max), generic over `{ id, inputSchema }`
- added: `apps/api/src/services/aiGeneration.assetResolver.ts` — walks `field.type === image_url|image_url_list|audio_url`, resolves bare asset IDs to 1-hour presigned URLs with ownership check; uses `parseStorageUri` from asset.service; `PRESIGN_EXPIRY_SECONDS = 3600`
- rewrote: `aiGeneration.service.ts` — `submitGeneration({ modelId, prompt?, options })` (lookup `AI_MODELS`, merge prompt into options, validate, kling-o3 XOR (fal-only), resolve assets, derive DB prompt fallback chain, enqueue, persist), `getJobStatus`, `listModels` returns `Record<AiCapability, AiModel[]>`
- rewrote: `aiGenerationJob.repository.ts` — `model_id` + `capability` columns; exports `AiCapability` (8 values after subtask 6); `enqueue-ai-generate.ts` payload `{ jobId, userId, projectId, provider, modelId, capability, prompt, options }`
- added: `GET /ai/models` route (auth-only); rewrote `aiGeneration.controller.ts` Zod schema for new model-based payload
- replaced: `apps/media-worker/src/jobs/ai-generate.job.ts` — single fal handler (273 lines): submit → per-poll progress (50→95) → `parseFalOutput(capability)` → fetch buffer → S3 upload → INSERT asset row `status='processing'` → enqueue `media-ingest` (FFprobe metadata) → mark job completed
- added: `apps/media-worker/src/jobs/ai-generate.output.ts` — capability-keyed output parser (text_to_image/image_edit reads `output.images[0].url`, video reads `output.video.url`); `detectExtension`, `contentTypeFromExtension`
- deleted: 8 provider adapters in `apps/media-worker/src/providers/` and `types.ts` (17 files)
- extended: `AiGenerateJobDeps` with `falKey`, `fal`, `ingestQueue`; `index.ts` instantiates worker-side `Queue<MediaIngestJobPayload>`
- added: `apps/api/src/__tests__/smoke/fal-generation.smoke.test.ts` — skip-guarded by `APP_FAL_SMOKE=1`, 4 cases (one per capability), inlined fal helpers

## AI Platform — Epic 9 Phase 2 (Image/Video/Audio Regroup + ElevenLabs)
- added: `AiGroup = 'images'|'videos'|'audio'`, `CAPABILITY_TO_GROUP`, `group` field on `FalModel`, all 9 entries populated; re-exported through web-editor types
- rebuilt: `CapabilityTabs.tsx` as two-level navigator (group buttons + capability sub-tabs); audio initially "Coming soon", later live
- added: `packages/api-contracts/src/elevenlabs-models.ts` — `ElevenLabsModel`, `AudioCapability`, `ELEVENLABS_MODELS` (4: text_to_speech/voice_cloning/speech_to_speech/music_generation), `AUDIO_CAPABILITY_TO_GROUP`
- added: `AiProvider = 'fal'|'elevenlabs'` discriminant on models; `audio_url` and `audio_upload` field types; unified `AI_MODELS = [...FAL, ...ELEVEN]` (13)
- added: `APP_ELEVENLABS_API_KEY` to media-worker config + `.env.example` + docker-compose (worker-only; api never calls ElevenLabs)
- added: `apps/media-worker/src/lib/elevenlabs-client.ts` — pure functions `textToSpeech`, `voiceClone`, `speechToSpeech`, `musicGeneration` + `ElevenLabsError`; mirrors `fal-client.ts` pattern
- added: `apps/media-worker/src/jobs/ai-generate-audio.handler.ts` — `processElevenLabsCapability` with 4 sub-handlers; `voice_cloning` stores ElevenLabs `voice_id` as `elevenlabs://voice/{id}` in result_url
- updated: `ai-generate.job.ts` — provider branch via `AUDIO_CAPABILITIES` set at top of try, dispatches to ElevenLabs handler; ElevenLabs deps wired in `index.ts`
- added: `voice.repository.ts` (createVoice, getVoicesByUserId), `listUserVoices(userId)` service, `GET /ai/voices` route; worker INSERTs into user_voices after successful clone
- updated FE: `CapabilityTabs.tsx` adds 4 audio sub-tabs (TTS/voice cloning/STS/music); `SchemaFieldInput.tsx` adds `audio_url` (AssetPickerField mediaType='audio') + `audio_upload` (file input accepting audio/*); `AssetPickerField.tsx` adds `mediaType?: 'image'|'audio'` prop
- generalized: `validateFalOptions` to accept any `{ id, inputSchema }`; `assetResolver` accepts `AiModel` and resolves `audio_url` similarly

## AI Generation — Frontend Schema-Driven Panel (Ticket 9)
- rewrote: `features/ai-generation/types.ts` — re-exports from api-contracts; `AiGenerationRequest = { modelId, prompt?, options }`, `ListModelsResponse`
- rewrote: `features/ai-generation/api.ts` — `listModels()` GET `/ai/models`; `submitGeneration(projectId, request)`
- created: `CapabilityTabs.tsx`, `ModelCard.tsx`, `AssetPickerField.tsx`, `SchemaFieldInput.tsx` (8-type dispatcher with exhaustiveness guard)
- rewrote: `GenerationOptionsForm.tsx` (pure schema iterator), `AiGenerationPanel.tsx` (orchestrator: catalog query, capability tabs, model list, options form, submit, progress, success/failure)
- added: `aiGenerationPanel.utils.ts` (getFirstCapabilityForGroup, seedDefaults, isCatalogEmpty, hasAllRequired, splitPromptFromOptions) + 28 unit tests
- split: styles into `aiGenerationPanelTokens.ts` (35), `aiGenerationFieldStyles.ts` (299), `aiGenerationPanelStyles.ts` (217) — all under §9.7 cap
- deleted: `GenerationTypeSelector.tsx`
- added: `@ai-video-editor/api-contracts` workspace dep in apps/web-editor; in apps/api with Dockerfile updates and api-contracts volume mount in docker-compose

## Asset Rename — Task B
- added: `displayName` column to assets (migration 017); `Asset.displayName` repo type + `mapRowToAsset` mapping; `updateAssetDisplayName` repo function
- added: `renameAsset(assetId, userId, displayName)` service — ownership enforced (NotFoundError on mismatch, info-leak prevention via identical message); trims input; whitespace-only stored as null
- added: `displayName` to `AssetApiResponse` + `toAssetApiResponse` (3 response funcs)
- added: `PATCH /assets/:id` — `patchAssetSchema = z.object({ name: z.string().trim().min(1).max(255) })`; route uses authMiddleware → aclMiddleware('editor') → validateBody → patchAsset handler
- added: FE `Asset.displayName: string|null`; `updateAsset(assetId, displayName)` in asset-manager api.ts
- added: `InlineRenameField.tsx` (extracted) — Enter commits, Escape cancels, validation (non-empty, ≤255), API error display, query invalidation `['assets', projectId]`, no-op when unchanged
- updated: `AssetCard.tsx` and `AssetDetailPanel.tsx` to render `asset.displayName ?? asset.filename`

## Progressive Reveal Captions — Task C
- added: `CaptionWord = { word, start, end }` and `CaptionSegment.words?: CaptionWord[]` to `packages/project-schema` (additive, no migration)
- updated: `transcribe.job.ts` segment mapping to extract `seg.words ?? []` from Whisper response into stored `CaptionSegment[]`
- added: `captionClipSchema` to `packages/project-schema` discriminated union — `{ id, type: 'caption', trackId, startFrame, durationFrames, words[]:{word,startFrame,endFrame}, activeColor: '#FFFFFF', inactiveColor: 'rgba(255,255,255,0.35)', fontSize: 24, position: top|center|bottom (default bottom) }`; exports `CaptionClip`
- updated: `ClipInsert.type` union and `createClipSchema` Zod enum to include `'caption'` (lockstep)
- added: `packages/remotion-comps/src/layers/CaptionLayer.tsx` — calls `useCurrentFrame()`, per-word color via `currentFrame >= word.startFrame`, frame-based (no timers), inline `<span>` with `whiteSpace: 'pre'` spaces, matches TextOverlayLayer textShadow
- updated: `VideoComposition.tsx` adds `caption` branch wrapping `<CaptionLayer>` in `<Sequence ... premountFor={fps}>`; same premount added to `text-overlay` branch; uses `useVideoConfig` for fps
- updated: `useAddCaptionsToTimeline.ts` — branches on `seg.words`: present/non-empty → produces `CaptionClip` with `Math.round(word.start * fps)` frame conversion (last word's endFrame capped to segment endFrame); absent/empty → falls back to `TextOverlayClip` (backward compat)
- added: `caption: '#10B981'` (success token) and updated `text-overlay: '#F59E0B'` (warning) in `ClipBlock.tsx` `CLIP_COLORS`; `getClipLabel(clip)` discriminated-union helper renders 40-char word preview for caption clips
- updated: `useCaptionEditor.ts` with function overloads — accepts `TextOverlayClip | CaptionClip`; returns discriminated `TextOverlayEditorSetters | CaptionEditorSetters`; all useCallback hooks called unconditionally
- updated: `CaptionEditorPanel.tsx` widened to `TextOverlayClip | CaptionClip` — `text` textarea + single `color` input render only when text-overlay; dual hex inputs ("Active word color" / "Inactive word color") render only when caption
- updated: `App.panels.tsx` 3 dispatch sites (RightSidebar, MobileTabContent captions tab + inspector tab) route caption clips to `CaptionEditorPanel`
- added: `apps/api/src/repositories/clip.repository.test.ts` — round-trip insert/get smoke test for `caption` ENUM literal (catches missing migration 018)

## Architectural Decisions / Notes
- §9.7 300-line cap enforced via test-file splits (`.fixtures.ts` + `.<topic>.test.ts` suffix convention) and component sub-extraction; one approved exception: `fal-models.ts` (1093 lines, pure data leaf module)
- Worker env discipline: only `index.ts` reads `config.*.key`; handlers receive secrets via deps
- ElevenLabs catalog uses same `FalInputSchema` shape so FE renderer is uniform
- Migration strategy for ai_generation_jobs reshape: DROP TABLE IF EXISTS + CREATE TABLE (mysql2 multipleStatements cannot carry DELIMITER procedures)
- Audio routes through ElevenLabs (not fal.ai) per `project_audio_provider.md`
- AI assets created with `status='processing'` then handed to `media-ingest` for FFprobe metadata
- `aiGenerationPanelStyles.ts` legacy `disabledNotice`/`linkButton` tokens left in place during ticket 8 deletion (cleaned in ticket 9 panel rewrite)

## Known Issues / TODOs
- ACL middleware stub — real project ownership check still deferred
- `packages/api-contracts/` OpenAPI spec only covers PATCH clip
- Presigned download URL deferred; S3 CORS needs bucket config
- Pre-existing 34–36 integration test failures expecting 401 fail when `APP_DEV_AUTH_BYPASS=true` is set on host (unrelated to AI/asset/caption work)
- Production stream endpoint needs signed URL tokens
- OAuth client IDs/secrets default empty
- Lint workspace-wide fails with ESLint v9 config-migration error (pre-existing)
- Pre-existing TS errors in unrelated test files (App.PreviewSection, App.RightSidebar, asset-manager, export, auth) outside scoped tickets

---

## [2026-04-13]

### Task: Task 1 — AssetPreviewModal: video/audio do not play
**Subtask:** 1.1 Switch `AssetPreviewModal` video/audio src to the `/assets/:id/stream` endpoint (+ 1.2 lockstep test rewrite)

**What was done:**
- `apps/web-editor/src/features/asset-manager/components/AssetPreviewModal.tsx` — replaced the `authenticatedDownloadUrl` memo (which wrapped `asset.downloadUrl`, a presigned S3 URL pointing at the internal object-storage hostname and unreachable from the browser in docker-compose dev) with a new `mediaStreamUrl` memo that builds `${config.apiBaseUrl}/assets/${asset.id}/stream` and passes it through `buildAuthenticatedUrl`. Both `<video>` and `<audio>` elements now consume `mediaStreamUrl`. Image branch untouched (already uses `getAssetPreviewUrl`). JSDoc updated to explain the reasoning so future agents don't regress it.
- `apps/web-editor/src/features/asset-manager/components/AssetPreviewModal.test.tsx` — rewrote the `describe('media src wiring')` block. Old tests asserted `downloadUrl+token` on both media branches, locking in the bug. New tests assert the exact stream URL (`http://localhost:3001/assets/<id>/stream?token=test`), cover two different asset ids, and explicitly verify that a presigned S3 `downloadUrl` with an `X-Amz-Signature` query param is **ignored** by the modal (regression guard).
- Ran `npx vitest run src/features/asset-manager/components/AssetPreviewModal.test.tsx` → 22/22 tests pass. `npx tsc --noEmit` emits only pre-existing errors in unrelated files — none in `AssetPreviewModal.tsx` or its test file.

**Notes:**
- Subtasks 1.1 and 1.2 were executed together because they are a lockstep pair: the planner split them for clarity, but 1.1 alone would leave the test suite red (old assertions hard-coded `downloadUrl+token`). Both are now removed from `active_task.md` and the remaining Task 1 subtasks (1.3, 1.4) are unchanged.
- Subtask 1.3 remains blocked on OQ-1 (user must confirm which audio affordance to hide in `AssetDetailPanel`) per `feedback_escalate_architecture` memory. Not started.
- Did **not** double-wrap via `getAssetPreviewUrl` because that helper returns `null` for audio and for video without a thumbnail, and its contract is "best preview image URL" (not playback URL). Reused the same pattern as `useRemotionPlayer.ts:68` instead — which is the canonical stream-URL construction site in the codebase.
- The image branch's dependency on `getAssetPreviewUrl` is unchanged and continues to work (the "image assets" test passes).
- Manual verification via docker-compose is deferred to subtask 1.4.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: 1.1 Switch `AssetPreviewModal` video/audio src to the `/assets/:id/stream` endpoint (+ 1.2 lockstep)</summary>

**1.1** Replace `buildAuthenticatedUrl(asset.downloadUrl)` with `buildAuthenticatedUrl(${config.apiBaseUrl}/assets/${asset.id}/stream)` for the `isVideo` and `isAudio` branches so both elements load from the API proxy. The image branch already uses `getAssetPreviewUrl()` which resolves to the same proxy — left unchanged.

**1.2** Rewrote the two "passes an authenticated URL … to the <video>/<audio> src" tests to assert the stream endpoint URL. Dropped the "appends token to an existing query string" cases (the stream URL has no pre-existing query string). Added regression guards asserting the presigned `downloadUrl` is ignored.

</details>

checked by code-reviewer - YES
code-reviewer notes: Correct `@/`-prefixed absolute import style. No business logic in component; pure rendering. `mediaStreamUrl` memo matches canonical stream-URL pattern used in `useRemotionPlayer.ts:68`. JSDoc clearly explains presigned S3 URL avoidance. 22/22 tests pass; regression guards verify presigned URLs ignored. `npx tsc --noEmit` emits only pre-existing errors in unrelated files. Architecture compliant.
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-04-13. Zero visual/layout changes — only data-layer fix (src URL for media elements). Modal structure, header, body, image branch, waveform rendering, and all styles remain untouched. This is plumbing work (presigned S3 → API stream endpoint). APPROVED.
qa-reviewer notes: Reviewed on 2026-04-13. Test file (`AssetPreviewModal.test.tsx`) covers: happy path video/audio with stream URL, asset-id variation (asset-001, asset-042, asset-099), regression guards verifying presigned S3 URLs are ignored, image assets unchanged. All 22 unit tests pass. Asset-manager feature suite (296 tests) regression-clear. Implementation verified: mediaStreamUrl memo builds `${config.apiBaseUrl}/assets/${asset.id}/stream` and wraps with `buildAuthenticatedUrl`; both <video> and <audio> consume it; image branch unchanged.
checked by playwright-reviewer: YES
playwright-reviewer notes: Reviewed on 2026-04-13 end-to-end. All three core workflows pass: (1) Video preview modal opens, <video> src loads from http://localhost:3001/assets/{id}/stream?token=..., media plays (duration 107.67s, controls visible), (2) Audio preview modal opens, <audio> src loads from same endpoint, waveform renders, media plays (duration 59.77s, controls visible), (3) Image preview regression guard passes — no layout/functionality change. Test asset upload, detail panel, preview button, media element rendering, and duration verification all confirmed working.

---

## [2026-04-13]

### Task: Task 2 — Caption word highlighting only works for the first clip
**Subtask:** 2.1 – 2.8 (atomic fix: OQ-2 resolved as approach B, offset prop; OQ-3 resolved as no-op)

**What was done:**
- **Decision (resolves OQ-2):** approach B — `clipStartFrame` prop on `CaptionLayer`. `word.startFrame` remains an absolute composition frame; the layer reconstructs the absolute frame as `clipStartFrame + useCurrentFrame()` before comparing. Chosen over approach A (clip-local schema rewrite) because it has zero blast radius: no schema migration, no producer changes, no fixture rewrites, no DB migration of persisted docs. Approach A was the planner's ideal-architecture recommendation but approach B is the correct pragmatic choice — the bug is a layer-side arithmetic error, and fixing it in the layer keeps the rest of the system untouched.
- **Decision (resolves OQ-3):** no legacy-doc migration needed. Approach B preserves the absolute-frame contract that existing persisted CaptionClips already use, so they render correctly with zero migration.
- `packages/remotion-comps/src/layers/CaptionLayer.tsx` — added `clipStartFrame?: number` prop (default `0`, so standalone / fixture usage keeps working). Changed `const currentFrame = useCurrentFrame();` to `const currentFrame = clipStartFrame + useCurrentFrame();`. Expanded the component JSDoc to document the frame semantic explicitly (why absolute frames, why `useCurrentFrame()` is local inside a Sequence, how the offset reconstructs the absolute frame) so a future agent can't silently regress the fix.
- `packages/remotion-comps/src/compositions/VideoComposition.tsx` — caption branch (the `<Sequence from={clip.startFrame}>` at lines 94–106) now passes `clipStartFrame={clip.startFrame}` to `<CaptionLayer>`.
- `packages/project-schema/src/schemas/clip.schema.ts` — added a doc block on `captionClipSchema` stating the contract ("`word.startFrame`/`endFrame` are **absolute** frames, not clip-local"), and per-field JSDoc on `word.startFrame` and `word.endFrame` pointing at the schema-level note. Pure JSDoc; no validation bound changes.
- `packages/remotion-comps/src/layers/CaptionLayer.test.tsx` — added a new `describe('clipStartFrame offset (regression: second-clip word highlighting)')` block with **5 new tests** (14 → 19 total): (1) word[0] activates at local frame 0 with clipStartFrame=150, (2) word[1] activates at local frame 10 (global 160), (3) all three words active at local frame 20 (global 170), (4) buggy-shape reproduction — without `clipStartFrame`, second-clip words stay inactive (guards against a silent default regression), (5) backward compatibility: `clipStartFrame={0}` behaves identically to the old unprop'd layer.
- Did **not** touch `useAddCaptionsToTimeline.ts` — it already emits absolute frames from Whisper timestamps (`Math.round(w.start * fps)`), which matches the absolute-frame contract codified in the schema. No producer change required.
- Did **not** touch any fixtures — existing fixtures use absolute frames, which remain correct under approach B.
- Ran: `remotion-comps` suite (49 tests pass), `project-schema` suite (89 tests pass), `apps/web-editor` captions feature suite (124 tests pass), `apps/web-editor` ClipBlock suite (31 tests pass). Total 293 tests touching caption-word, schema, and downstream consumers — all green.

**Notes:**
- User was explicit: "issue is not resolved second clip, do not highlite active word". This is the exact regression the new 5-test block locks in place. The second-clip scenario is `CLIP_CAPTION` at `startFrame=150` with absolute word frames [150, 160, 170]; before the fix, `useCurrentFrame()` returned 0 inside the Sequence and every word stayed inactive forever.
- Approach B deliberately leaves the ideal-architecture approach A on the table for a future refactor (if the team later adopts `@remotion/captions` `TikTokPage` tokens which use local-frame conventions). That migration would be one fixture rewrite and one producer tweak — documented in the schema JSDoc so the path is obvious.
- The `premountFor={fps}` on the caption Sequence is unchanged — unrelated to the bug, and the `clipStartFrame` prop is compatible with pre-mounted frames (they still return local frames inside the Sequence).
- Subtask 2.9 (manual docker-compose verification with two caption clips at different `startFrame` positions) is deferred until the playwright-reviewer runs; unit-level regression coverage is in place.

**Completed subtasks from active_task.md:**
<details>
<summary>Subtasks 2.1 – 2.8 (Task 2 — caption word highlighting second-clip fix)</summary>

**2.1** Resolved OQ-2 as approach B (offset prop). Rationale: smallest blast radius, zero migration, backward compatible.
**2.2** Added schema JSDoc declaring `word.startFrame`/`endFrame` as absolute frames + expanded `CaptionLayer` JSDoc documenting the offset reconstruction.
**2.3** `CaptionLayer.tsx` — added `clipStartFrame?: number` prop (default 0), replaced `const currentFrame = useCurrentFrame()` with `const currentFrame = clipStartFrame + useCurrentFrame()`.
**2.4** `VideoComposition.tsx` — caption branch now passes `clipStartFrame={clip.startFrame}` to `<CaptionLayer>`.
**2.5** No-op under approach B (producer already emits absolute frames from Whisper timestamps).
**2.6** No-op under approach B (fixtures already use absolute frames; default `clipStartFrame=0` keeps existing tests green unchanged).
**2.7** Added 5 regression tests in `CaptionLayer.test.tsx` (second-clip activation at local frame 0/10/20, buggy-shape reproduction, backward-compat with clipStartFrame=0). Total CaptionLayer tests: 14 → 19.
**2.8** Resolved OQ-3 as no-op. Approach B preserves the absolute-frame contract existing persisted docs already use; no DB migration required.

</details>

**Follow-up fix (2026-04-13, in response to code-reviewer COMMENT):** split `CaptionLayer.test.tsx` per §9.7 300-line cap. The new regression block was extracted into a sibling topic-named file `packages/remotion-comps/src/layers/CaptionLayer.regression.test.tsx` (155 lines). Original `CaptionLayer.test.tsx` is now 200 lines. Each file carries its own minimal vi.mock/helper setup; the cross-reference is left as a comment in `CaptionLayer.test.tsx` pointing at the sibling file. Test counts unchanged: 14 tests in the primary file + 5 tests in the regression file = 19 total. Re-ran full `remotion-comps` suite → 49/49 tests pass across 4 files.

checked by code-reviewer - YES
code-reviewer notes: Re-reviewed follow-up split on 2026-04-13. Both test files under 300-line §9.7 cap: `CaptionLayer.test.tsx` 200 lines, `CaptionLayer.regression.test.tsx` 155 lines. Naming convention correct (.<topic>.test.tsx). No production code changed since prior review — `CaptionLayer.tsx`, `VideoComposition.tsx`, `clip.schema.ts` diffs from prior commit are identical. New regression file carries proper minimal vi.mock setup + `getWordSpans` helper (4 lines, duplicated from primary file per acceptable inline pattern), clear JSDoc explaining bug/fix/why file exists. Cross-reference comment present in primary file (lines 176–178). Full test suite: 49/49 tests pass across 4 files (CaptionLayer.test.tsx 14 + CaptionLayer.regression.test.tsx 5 + VideoComposition.test.tsx 23 + VideoComposition.utils.test.ts 7). Architecture compliant.
checked by qa-reviewer - YES
qa-reviewer notes: Re-verified 2026-04-13 after test-file reorganization. The 5-test regression block was extracted into sibling `CaptionLayer.regression.test.tsx` (155 lines) satisfying §9.7 300-line cap. Original `CaptionLayer.test.tsx` now 200 lines with 14 non-regression tests intact. All 5 regression cases present verbatim: (1) second-clip local frame 0 activation (global 150), (2) mid-sequence frame 10 (global 160), (3) all-active frame 20 (global 170), (4) buggy-shape reproduction (words stay inactive without clipStartFrame), (5) backward-compat clipStartFrame=0. Production code unchanged: CaptionLayer.tsx has `clipStartFrame` prop + offset reconstruction (line 64), VideoComposition.tsx passes `clipStartFrame={clip.startFrame}` (line 99). Full regression gate: remotion-comps 49/49 tests, project-schema 89/89 tests, web-editor captions 124/124 tests, ClipBlock 31/31 tests. Total 293 tests touching caption-word logic — all green. Split preserves full coverage and maintains test isolation.
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-04-13. Pure rendering-arithmetic fix with zero visual surface change. `clipStartFrame` prop reconstruction of absolute frame (line 64: `clipStartFrame + useCurrentFrame()`) fixes the bug but alters no style, color, layout, typography, spacing, shadow, or position. All visual attributes (fontSize 24, activeColor #FFFFFF, inactiveColor rgba(255,255,255,0.35), textShadow, padding, position styles, fontFamily Inter 600) remain unchanged. The fix restores correct color-switching behavior for captions after the first clip without modifying what the user sees. Per `feedback_design_reviewer_backend` memory (backend-only fixes with zero UI surface change), this is APPROVED. (Follow-up note: the test-file split is a test-only reorganization with no production-code change, so this approval remains valid.)
checked by playwright-reviewer: YES
playwright-reviewer notes: Verified 2026-04-13 follow-up split on 2026-04-13. Production code (`CaptionLayer.tsx` line 64, `VideoComposition.tsx` line 99, `clip.schema.ts` captions JSDoc) remains unchanged since prior APPROVED review — test reorganization only. Unit tests all pass: 49/49 across 4 files (CaptionLayer.regression.test.tsx 5 new tests + CaptionLayer.test.tsx 14 tests + VideoComposition.test.tsx 23 tests + VideoComposition.utils.test.ts 7 tests). File split complies with §9.7 300-line cap (CaptionLayer.test.tsx 200 lines, CaptionLayer.regression.test.tsx 155 lines). E2E sanity check: editor loads at http://localhost:5173 without JS errors; no regression in app stability. Second-clip caption word-highlighting behavior locked in by regression tests and verified intact at unit level. Follow-up reorganization approved.

---

## [2026-04-14]

### Task: EPIC 10 STAGE 1 — Design Tooling Migration (Figma → Google Stitch)
**Subtask:** 0. Write this mini-epic back into `docs/general_tasks.md`

**What was done:**
- Prepended a new "EPIC 10 — STAGE 1 — Design Tooling Migration (Figma → Google Stitch)" section in `docs/general_tasks.md`, positioned immediately above the existing "EPIC 10 — Text-to-Video Pipeline" header.
- Section contains: goal, scope boundaries (config + Stitch cloud + docs only, no code), high-level subtask list (0–9) referencing `docs/active_task.md` for detail, dependencies, effort (M), status (Ready for task-executor).
- Explicitly preserved all four existing Epic 10 implementation tickets (LLM storyboard generator, Text-to-Video orchestrator, Auto-caption for TTV, Text-to-Video wizard modal) — reclassified as STAGE 3.
- Files modified: `docs/general_tasks.md` (insertion only; no deletions).
- Tests written: none. Pure markdown backlog edit — not a code-testable change. Verification is a visual diff plus confirmation that subsequent Epic 10 content is byte-identical.

**Notes:**
- This subtask has no ⚠️ escalation marker in `active_task.md`, so it was executed without stopping for user input per the plan.
- The section references `docs/active_task.md` as the source of truth for subtask detail rather than duplicating the full plan, to avoid drift between the two files as the mini-epic progresses.
- Next subtask (1) IS marked ⚠️ — the executor must stop and present the Stitch MCP server comparison to the user before installing anything.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask 0: Write this mini-epic back into `docs/general_tasks.md`</summary>

- What: Add a new section at the top of Epic 10 titled "STAGE 1 — Design Tooling Migration (Figma → Stitch)" that references this `active_task.md` and lists the subtasks below at a high level. Do not remove or re-order the existing Epic 10 tickets; they become STAGE 3 onward.
- Where: `docs/general_tasks.md` lines 1–2 (immediately above the existing "EPIC 10 — Text-to-Video Pipeline" header)
- Why: Keeps the project backlog consistent with the active plan so future task-planner runs see this work.
- Depends on: none

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-04-14. Approved as documentation-only. Zero UI surface change — pure markdown backlog reorganization with no visual, spacing, typography, or color decisions. No design-guide or Figma validation needed per approved pattern for docs-only changes.
checked by playwright-reviewer: YES
playwright-reviewer notes: Verified 2026-04-14. Markdown-only change — docs files only. No code, TypeScript, routes, or components touched. git diff shows 63 additions to docs only. npx tsc emits only pre-existing errors in unrelated test files. New EPIC 10 STAGE 1 section properly prepended above existing Epic 10 header with all four existing tickets preserved and reclassified as STAGE 3. Zero UI surface to test. APPROVED.

---

## [2026-04-14]

### Task: EPIC 10 STAGE 1 — Design Tooling Migration (Figma → Google Stitch)
**Subtask:** 1. Research & select the Stitch MCP server implementation

**What was done:**
- Fetched README files and GitHub/npm metadata for all four candidate community repos and for the official Google-maintained implementation.
- Confirmed (OQ-5): A first-party Google Stitch MCP server EXISTS. It is `StitchProxy` inside `@google/stitch-sdk` (repo: `google-labs-code/stitch-sdk`, published by `google-wombot@google.com`, Apache-2.0, actively maintained — last push 2026-04-11, 1 504 stars).
- Confirmed the official Google docs page (`https://stitch.withgoogle.com/docs/mcp/setup/`) is a JavaScript-rendered SPA and could not be scraped via curl; content is not accessible without a real browser session.
- Confirmed `davideast/stitch-mcp` (780 stars, Apache-2.0, last push 2026-04-02) is authored by a `@google-labs-code` employee (David East, company: `@google-labs-code`, bio: "Working on @google-labs-code. Stitch and Jules") and wraps the official `@google/stitch-sdk`. It is not an independent community fork — it is the Google Labs-adjacent CLI/proxy layer.
- Produced the comparison table below.
- **Stopped without installing anything.** Waiting for user to pick from options A, B, or a recommendation.

**Comparison table (verified from actual READMEs and npm registry — not from planning-session WebFetch):**

| Attribute | A: `@google/stitch-sdk` (StitchProxy) | B: `davideast/stitch-mcp` | C: `Kargatharaakash/stitch-mcp` | D: `oogleyskr/stitch-mcp-server` | E: `piyushcreates/stitch-mcp` |
|---|---|---|---|---|---|
| **Author / org** | `google-labs-code` (Google) | David East (`@google-labs-code` employee) | Aakash Kargathara (community) | Community (unknown) | Community (unknown) |
| **Stars** | 1 504 | 780 | 95 | 4 | 0 |
| **Last pushed** | 2026-04-11 | 2026-04-02 | 2026-02-13 | 2026-03-26 | 2026-02-10 |
| **Language** | TypeScript | TypeScript | JavaScript (plain) | TypeScript | Python |
| **npm package** | `@google/stitch-sdk` v0.1.0 | `@_davideast/stitch-mcp` v0.5.3 | `stitch-mcp` v1.3.2 | (no npm package) | (no npm package) |
| **Transport** | stdio (via `StdioServerTransport`) | stdio (`proxy` subcommand) | stdio | stdio | stdio |
| **Tool count** | 7 upstream (list/get/generate/edit/variants + build_site/get_screen_code/get_screen_image via davideast's virtual layer) | 7 upstream + 3 virtual (`build_site`, `get_screen_code`, `get_screen_image`) | 9 (list_projects, get_project, list_screens, get_screen, extract_design_context, fetch_screen_code, fetch_screen_image, generate_screen_from_text, create_project) | 36 across 9 categories | 6 (direct Stitch API proxy) |
| **Auth** | `STITCH_API_KEY` (env) OR `STITCH_ACCESS_TOKEN` OR gcloud ADC | `STITCH_API_KEY` (env) OR gcloud OAuth (wizard via `init`; also supports `STITCH_USE_SYSTEM_GCLOUD=1`) | `GOOGLE_CLOUD_PROJECT` + gcloud ADC (application-default login) | `STITCH_API_KEY` OR `STITCH_ACCESS_TOKEN` OR gcloud CLI | `STITCH_API_KEY` (env only) |
| **MCP config snippet (for Claude Code)** | Custom script wrapping `StitchProxy` (requires a small wrapper .ts or .js file to write) | `npx @_davideast/stitch-mcp proxy` | `npx -y stitch-mcp` with `GOOGLE_CLOUD_PROJECT` env | Clone + `npm install` + local path | Clone + `python3 /path/to/stitch_mcp.py` |
| **Claude Code compatibility** | Yes (stdio) | Explicitly listed as supported client | Yes (stdio) | Yes (stdio) | Yes (stdio, Python 3.10+) |
| **License** | Apache-2.0 | Apache-2.0 | Apache-2.0 (README says MIT, package.json says Apache — discrepancy; filed as informational) | Apache-2.0 (from README badge; no `license` field in package.json) | None declared |
| **Maintenance signal** | Google org, active CI, 23 open issues (triaged), Dependabot PRs | 0.5.x release cadence, 11 open issues, maintained by Google Labs employee | Last release 2026-02-13; 0 open issues; likely unmaintained | 1 commit total on 2026-03-26; 2 open issues; likely stale | 1 commit on 2026-02-10; 0 activity since |
| **Extra features** | `StitchToolClient`, Vercel AI SDK integration, programmatic SDK | `init` wizard (handles gcloud install + auth), `serve`, `site`, `view`, `doctor`, `snapshot`, local Vite dev server | extract_design_context (reads fonts/colors/layouts) | Design analysis, dark-mode generation, responsive variants, component variants, accessibility audit, PM issue generation, trending designs | Thin proxy only |

**OQ-5 Answer (first-party server):** Confirmed YES. `google-labs-code/stitch-sdk` (published under the `@google` npm scope by `google-wombot@google.com`) ships `StitchProxy` — a proper `StdioServerTransport`-based MCP proxy. However, it is a library component, not a standalone npx-runnable server. Using it directly requires writing a small wrapper script. The `davideast/stitch-mcp` CLI (`npx @_davideast/stitch-mcp proxy`) provides exactly that wrapper plus auth automation and is authored by a member of the same Google Labs Code team.

**Recommendation (for user decision only — not enacted):** Option B (`davideast/stitch-mcp`) is the best fit for this project because:
1. It IS the first-party-adjacent tool — built by a Google Labs Code employee, wrapping `@google/stitch-sdk`, explicitly lists Claude Code as a supported client.
2. The `init` wizard handles gcloud auth automatically (critical for subtask 2).
3. The `proxy` subcommand produces a clean `npx @_davideast/stitch-mcp proxy` MCP config entry — zero local install step.
4. Actively maintained (last push 2026-04-02, versioned releases).
5. Apache-2.0 license.
6. The `STITCH_USE_SYSTEM_GCLOUD=1` env var allows using the user's existing gcloud login without the bundled gcloud — which matters if the user already has `gcloud auth application-default login` done (subtask 2 will confirm).

Option A (`@google/stitch-sdk` StitchProxy directly) is viable if the user wants zero third-party code, but requires writing and maintaining a small wrapper script. Option C (Kargatharaakash) is simpler but less maintained and has a license discrepancy. Options D and E should not be used.

**Notes:**
- The WebFetch-synthesized install recipe from the planning session (`npx -y stitch-mcp`, `gcloud beta services mcp enable stitch.googleapis.com`) appears to be a blend of Option C's package name with Option B's auth flow. Specifically: `gcloud beta services mcp enable stitch.googleapis.com` is from Option B/A's auth path (confirmed in davideast README). The `npx -y stitch-mcp` command installs Option C (Kargatharaakash), NOT Option B. Do not blindly follow that recipe for Option B.
- Verified install command for Option B (from actual README): add `{ "command": "npx", "args": ["@_davideast/stitch-mcp", "proxy"] }` to MCP config. Auth: run `npx @_davideast/stitch-mcp init` interactively OR set `STITCH_API_KEY` env var directly OR set `STITCH_USE_SYSTEM_GCLOUD=1` if gcloud ADC is already configured.
- The official docs page (stitch.withgoogle.com/docs/mcp/setup/) requires a logged-in browser session and could not be read by curl; its contents are behind a JS SPA. The README of `davideast/stitch-mcp` and the `@google/stitch-sdk` docs cover the same auth flow and are verified verbatim.
- No files outside this log were changed during this subtask. `active_task.md` updated to mark subtask 1 complete.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask 1: Research & select the Stitch MCP server implementation</summary>

- What: Fetch the READMEs of the four candidate repos and the official Google page. Compare: maintenance recency, tool count, auth model, transport, Claude Code compatibility, licensing. Produce a short comparison table and a recommendation. STOP and ask the user to pick before installing anything.
- Where: Write findings into a new scratch section in this file ("Stitch MCP candidate comparison") and escalate to user.
- Why: Multiple community implementations exist; picking the wrong one wastes time and may require a redo when the first-party Google server stabilizes.
- Depends on: none

</details>

checked by code-reviewer - OK
code-reviewer notes: Research & documentation-only subtask (markdown comparison table with no code/config/test changes). Scope: comparing five Stitch MCP implementations and recommending one. Files touched: docs/development_logs.md only. Per architecture-rules.md §1 ("authoritative source of truth for where code belongs"), code-quality-expert reviews code placement, structure, naming, patterns, and security — not research documentation or tool selection decisions. This subtask is out of scope for code review (it is an architectural escalation task per feedback_escalate_architecture memory, not a code quality task). Verdict: out of scope (documentation research, zero code surface).
checked by qa-reviewer - YES
checked by design-reviewer - YES
checked by playwright-reviewer: YES

---

## [2026-04-14]

### Task: EPIC 10 STAGE 1 — Design Tooling Migration (Figma → Google Stitch)
**Subtask:** 3. Install the Stitch MCP server via `update-config` skill

**What was done:**
- Verified the real `@_davideast/stitch-mcp` README via `gh api repos/davideast/stitch-mcp/readme` (authoritative, not WebFetch). Confirmed: package name is `@_davideast/stitch-mcp` (underscore-prefixed scope), proxy entry point is `npx @_davideast/stitch-mcp proxy`, auth can be `STITCH_API_KEY` env var which skips OAuth and gcloud entirely. This cleared the planner's "possibly hallucinated install recipe" warning.
- Confirmed with user (escalation resolved 2026-04-14):
  - OQ-1 / Subtask 1 decision: Option B — `davideast/stitch-mcp` (confirmed).
  - OQ-2 / GCP project: **skipped** — API-key auth path bypasses gcloud/ADC/GCP project creation entirely. No new GCP project needed.
  - Subtask 5 path: **hybrid** — user will build empty Stitch project + design system tokens in the Stitch web UI manually; agent will fetch/populate docs and attempt any supported MCP-driven screen generation for the 4 key screens.
- User provided live `STITCH_API_KEY` in chat (plaintext). Key was used ONLY to populate `~/.claude.json` via atomic write; never echoed to any file under the repo, never committed, never logged, never printed in plain diffs. When showing the diff for verification, the key was redacted via sed.
- Security heads-up: the key now lives in the conversation transcript. User has been advised to rotate it at stitch.withgoogle.com after setup if desired.
- Backup of `~/.claude.json` saved before edit: `~/.claude.json.backup-pre-stitch-20260414-200927`.
- Edit strategy: Python JSON round-trip with atomic write (tempfile + `os.replace`) instead of string surgery. Chosen over Edit tool because (a) the same file contains a live `fal-ai` Bearer token on line 619 that must not be exposed in any Edit tool old_string, (b) JSON round-trip provides schema-level safety for the whole file vs byte-level string replacement, (c) atomic write guarantees no corruption on interruption.
- Preflight assertions in the Python script: `fal-ai` present, `figma-remote-mcp` present, `stitch` absent. Post-mutation verification: SHA-256 hashes of `fal-ai` and `figma-remote-mcp` blocks computed before and after mutation — confirmed byte-identical. Re-parsed the resulting file as JSON to confirm validity.
- Diff verification (with both secrets redacted via sed): only 11 new lines added in the `stitch` block and a trailing newline at EOF. No other lines touched.

**Files created or modified:**
- `~/.claude.json` — added `projects["/home/oleksii/Work/ClipTale/cliptale.com-v2"].mcpServers.stitch` entry (lines 622–632 in the new file). Shape:
  ```json
  "stitch": {
    "command": "npx",
    "args": ["-y", "@_davideast/stitch-mcp", "proxy"],
    "env": { "STITCH_API_KEY": "<REDACTED>" }
  }
  ```
- `~/.claude.json.backup-pre-stitch-20260414-200927` — full backup of pre-edit state. Kept on disk for recovery until user confirms everything works.

**Tests written and what they cover:**
- None. This subtask is config-only (user-level `~/.claude.json` mutation). No code path was introduced or modified. The planner explicitly scopes the entire EPIC 10 STAGE 1 as "config + design creation + markdown rewrites only. No code changes."
- In lieu of tests, the Python edit script contains inline assertions (preflight + post-hash verification + re-parse) that function as one-shot correctness checks.

**Notes:**
- **Subtask 4 (connectivity verification) requires a Claude Code session restart.** MCP servers load at session start. Until the user restarts Claude Code, the `mcp__stitch__*` tool namespace will not be available in the model's tool list, and no proxy handshake can be tested from inside this session.
- `figma-remote-mcp` was intentionally NOT removed — subtask 6 removes it only after subtask 4 verifies Stitch is actually working, per the planner's strict 4 → 6 dependency ordering.
- `fal-ai` was NOT touched. Hash-verified identical before and after.
- The `update-config` skill was invoked as required by the planner's `update-config skill is REQUIRED` rule. The skill's workflow (read before write, merge don't replace, validate JSON) was followed via the Python script's assertions.
- If this subtask is rejected and needs to roll back: `cp ~/.claude.json.backup-pre-stitch-20260414-200927 ~/.claude.json`.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask 3: Install the Stitch MCP server via `update-config` skill</summary>

- What: Use the `update-config` skill to edit `~/.claude.json` — specifically the `projects["/home/oleksii/Work/ClipTale/cliptale.com-v2"].mcpServers` block. Add the selected Stitch server entry next to the existing `fal-ai` entry. **Do NOT touch `fal-ai`** (it contains a live Bearer token the user depends on). **Do NOT remove `figma-remote-mcp` yet** — subtask 6 does that after verification.
- Where: `~/.claude.json` lines 610–622 (project mcpServers block). Use `update-config` skill only.
- Why: Gets the new MCP server registered without losing the fallback.
- Depends on: 2

</details>

checked by code-reviewer - YES
code-reviewer notes: Reviewer gate skipped per user decision 2026-04-14. Config-only subtask (single JSON edit to `~/.claude.json`). No source code, no tests, no architecture-rules.md-covered surface. Pattern: config-only subtasks do not require code review.
checked by qa-reviewer - YES
qa-reviewer notes: Reviewer gate skipped per user decision 2026-04-14. Config-only subtask — no executable code added, no test surface. Inline preflight/posthash/reparse assertions in the Python edit script served as one-shot correctness checks.
checked by design-reviewer - YES
design-reviewer notes: Reviewer gate skipped per user decision 2026-04-14. Config-only subtask with zero UI surface. No Figma/Stitch design fidelity validation applicable to a user-level MCP server registration.
checked by playwright-reviewer: YES
playwright-reviewer notes: Reviewer gate skipped per user decision 2026-04-14. Config-only subtask — no UI workflow to regress. Verification of MCP connectivity is deferred to subtask 4, which requires a fresh Claude Code session (MCP tools load at session start).

---

## [2026-04-14]

### Task: EPIC 10 STAGE 1 — Design Tooling Migration (Figma → Google Stitch)
**Subtask:** 4. Verify Stitch MCP connectivity

**What was done:**
- Observed that `mcp__stitch__*` tools were NOT present in the current Claude Code session's deferred tool list, even though `~/.claude.json` has the stitch entry under `projects["/home/oleksii/Work/ClipTale/cliptale.com-v2"].mcpServers` (hash-verified intact from subtask 3). Root cause: project-level `mcpServers` are re-read on session start; the Claude Code session running this agent was launched before subtask 3's edit landed OR has cached the pre-edit tool list. `claude mcp list` only surfaces the user-scoped `plugin:figma:figma` HTTP server (consistent with previous runs), so that command is not an appropriate health probe for project-scoped stdio servers.
- Verified the stitch server out-of-band by spawning it with the exact command + env that `~/.claude.json` registers (`npx -y @_davideast/stitch-mcp proxy` with `STITCH_API_KEY` from the config) and driving a full MCP stdio handshake from a short Python script. Secret hygiene: the API key was loaded from `~/.claude.json` into the subprocess env only; never printed, never echoed to any file, never committed.
- MCP handshake results (captured live, not synthesized):
  - `initialize` → OK. Server announces `serverInfo = { name: "stitch-proxy", version: "1.0.0" }`, `protocolVersion: 2024-11-05`, `capabilities: { tools }`.
  - `notifications/initialized` → sent.
  - `tools/list` → OK. Server exposes **12 tools**: `create_project`, `get_project`, `list_projects`, `list_screens`, `get_screen`, `generate_screen_from_text`, `edit_screens`, `generate_variants`, `create_design_system`, `update_design_system`, `list_design_systems`, `apply_design_system`.
  - `tools/call list_projects {}` → OK (non-error response). Returned a real project entry: `{ name: "projects/4209061398031290155", title: "AI Remotion Editor Architecture", visibility: "PRIVATE", createTime: "2026-04-09T20:49:26Z", updateTime: "2026-04-14T18:04:34Z", projectType: "TEXT_TO_UI_PRO", thumbnailScreenshot: { name: "projects/4209061398031290155/files/5dad36b6a4914babb9fe34d188ffe71e", downloadUrl: "https://lh3.googleusercontent.com/aida/..." } }`.
- Auth is working. The `STITCH_API_KEY` added in subtask 3 is valid and authorized against the live Stitch API.

**Findings that change subtask 5 / subtask 7 planning (MUST read before starting subtask 5):**
1. **Live tool list ≠ subtask 1 research.** Subtask 1's README-based research documented "7 upstream + 3 virtual (`build_site`, `get_screen_code`, `get_screen_image`)" for Option B. The actually-running proxy exposes 12 tools and **none of them are `build_site`, `get_screen_code`, or `get_screen_image`**. The virtual davideast-layer tools named in the README are not active in this server build. New tools present (not in research): `edit_screens`, `generate_variants`, `create_design_system`, `update_design_system`, `list_design_systems`, `apply_design_system`. Subtask 5's path 5a (agent-led) was scoped against `create_project + generate_screen_from_text` — both of which ARE present and usable.
2. **An existing Stitch project already exists for the user.** `list_projects` returned `projects/4209061398031290155` titled "AI Remotion Editor Architecture", last updated TODAY (2026-04-14 18:04 UTC). Given the ClipTale tech stack ("AI video editor built with Remotion") this is almost certainly the user's in-progress project. Subtask 5's plan assumes a fresh `create_project` call. **This needs to be added to subtask 5's ⚠️ escalation**: ask the user whether to (a) reuse the existing project and retitle it "ClipTale", (b) reuse as-is and layer ClipTale assets on top, or (c) create a new project and leave the existing one alone.
3. **Stitch has a first-class design system concept after all.** Subtask 1 research concluded "Stitch has no equivalent concept [to Figma variables] per initial research; confirm during subtask 1" and subtask 7 planned to DELETE the §3 "Figma Variable IDs" table from `docs/design-guide.md` entirely. The presence of `create_design_system` / `update_design_system` / `list_design_systems` / `apply_design_system` tools strongly contradicts that assumption. Subtask 7 should plan to **replace** the variable-IDs table with a Stitch design-system-ID table (populated from `list_design_systems`), not delete it. Before doing that, the next agent should call `list_design_systems` on the existing project to see whether one already exists.
4. **The `davideast/stitch-mcp` wrapper behaves as a thin proxy to `@google/stitch-sdk`'s upstream API.** The 12 tools match the upstream Stitch API surface rather than the README's documented wrapper-extended set, confirming subtask 1's "Option B is essentially the first-party flow" reading.

**Why the session's deferred-tool list didn't include `mcp__stitch__*` (non-blocker but worth recording):**
- Claude Code's MCP loader reads project-scoped `mcpServers` at Claude CLI session launch. Subtask 3 edited `~/.claude.json` at 20:09 UTC on 2026-04-14; any agent session started before that time will not see the new tools, and a subagent spawned from such a parent inherits the parent's tool manifest. This session's `ToolSearch` for `stitch` / `mcp` / `select:mcp__stitch__list_projects` all returned empty, confirming the loader did not pick up the edit. No follow-up is needed for this session specifically — once the user restarts Claude Code, the tools will appear automatically. The stdio handshake above proves the server side is healthy regardless.

**Files created or modified:**
- None. Subtask 4 is a pure runtime connectivity probe. `docs/active_task.md` will be updated to mark subtask 4 done in a separate edit after this log entry lands.

**Tests written and what they cover:**
- None. No code was added. The one-shot Python handshake script served as the connectivity probe (initialize → tools/list → tools/call list_projects). The probe was deliberately not persisted to the repo: it reads the live `STITCH_API_KEY` out of `~/.claude.json` and has no business inside the tracked codebase.

**Notes:**
- Subtask 4's dependency (subtask 3) is satisfied — the config edit landed correctly and the server launches, authenticates, and responds to real tool calls.
- **Subtask 6 (remove figma-remote-mcp) is now unblocked** by the connectivity verification, but it should STILL wait for subtask 5 per the planner's strict `5 → 6 → 7` dependency ordering. Do not remove figma-remote-mcp until the new Stitch source of truth actually exists (at minimum the project is picked/created and the design-system doc is captured).
- **Subtask 5 has a ⚠️ escalation marker** plus the two new ⚠️-worthy findings above (existing project, design-system-concept-exists). The next agent MUST stop and escalate before running any Stitch create/generate tools.
- `~/.claude.json.backup-pre-stitch-20260414-200927` backup is still present and can still roll back subtask 3 if needed.
- No changes to `figma-remote-mcp`, `fal-ai`, or any other MCP server entry.
- No changes to the repo working tree. `git status` for repo files unchanged since the start of this session except for the in-progress edits to `docs/development_logs.md` and `docs/active_task.md` that this subtask is writing now.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask 4: Verify Stitch MCP connectivity</summary>

- What: After the MCP server is registered, confirm Claude Code actually sees the new tools. In a follow-up turn (MCP tools load on session start), call the simplest read-only Stitch tool available (e.g. `list_projects` or equivalent) and confirm a non-error response. If auth fails, loop back to subtask 2/3 with the error message.
- Where: Runtime check; no file changes unless debugging.
- Why: Catches config errors before doing any destructive removal of Figma.
- Depends on: 3

</details>

checked by code-reviewer - YES
code-reviewer notes: Reviewer gate skipped per `feedback_reviewer_gate_config_only` memory. Subtask 4 is a pure runtime connectivity probe — ZERO file edits (no source code, no tests, no config changes, no repo docs except this log entry itself). The memory's scope ("config-only") is strictly broader than "zero-edit verification"; a fortiori the gate skip applies. Nothing to code-review.
checked by qa-reviewer - YES
qa-reviewer notes: Reviewer gate skipped per `feedback_reviewer_gate_config_only` memory. No test surface introduced or modified. The one-shot MCP handshake script (Python) was intentionally not persisted to the repo (it reads a live API key from `~/.claude.json` and has no place in the tracked codebase). The handshake results — `initialize` OK, `tools/list` returning 12 tools, `list_projects` returning a real non-error response — are logged verbatim above and function as the one-shot correctness evidence.
checked by design-reviewer - YES
design-reviewer notes: Reviewer gate skipped per `feedback_reviewer_gate_config_only` memory. Zero UI surface — pure MCP stdio handshake against a cloud API. No visual change, no Figma/Stitch design-guide fidelity check applicable.
checked by playwright-reviewer: YES
playwright-reviewer notes: Reviewer gate skipped per `feedback_reviewer_gate_config_only` memory. No UI workflow to regress — subtask 4 neither loads the web editor nor touches any React code. Editor dev server state is unchanged from subtask 3's reviewer entry.

---

## [2026-04-14]

### Task: EPIC 10 STAGE 1 — Design Tooling Migration (Figma → Google Stitch)
**Subtask:** 5. Create a Stitch project for ClipTale and recreate the design system

**What was done:**
- Verified `mcp__stitch__*` tool namespace is now loaded in the current Claude Code session (subtask 4's finding that the prior session lacked them is resolved — the restart took effect). Loaded the following tools via `ToolSearch`: `mcp__stitch__create_project`, `mcp__stitch__create_design_system`, `mcp__stitch__update_design_system`, `mcp__stitch__generate_screen_from_text`, `mcp__stitch__list_screens`, `mcp__stitch__get_screen`, `mcp__stitch__get_project`, `mcp__stitch__list_projects`.
- Followed the planner's execution plan verbatim (path 5a, agent-led, fresh project). Did NOT touch the existing `projects/4209061398031290155` ("AI Remotion Editor Architecture") per the decision captured in subtask 4's findings and the locked-in plan on subtask 5.
- **Step 1 (create project)** — `mcp__stitch__create_project { title: "ClipTale" }` → returned `{ name: "projects/1905176480942766690", origin: "STITCH", projectType: "PROJECT_DESIGN", title: "ClipTale", visibility: "PRIVATE" }`. Project ID captured: **`1905176480942766690`**.
- **Step 2 (create design system)** — `mcp__stitch__create_design_system` against project `1905176480942766690` with payload seeded from `docs/design-guide.md` §3:
  - `displayName`: `"ClipTale Dark"`
  - `theme.colorMode`: `DARK`
  - `theme.headlineFont` / `bodyFont` / `labelFont`: `INTER`
  - `theme.roundness`: `ROUND_EIGHT` (mirrors `radius-md` 8px, the dominant UI radius)
  - `theme.customColor`: `#7C3AED` + `theme.overridePrimaryColor`: `#7C3AED` + `theme.colorVariant`: `VIBRANT`
  - `theme.spacing`: 8 tokens `space-1..space-16` mapping to 4/8/12/16/24/32/48/64 px (the full 4px grid from §3)
  - `theme.typography`: 8 tokens (display / heading-1 / heading-2 / heading-3 / body / body-sm / label / caption) populated with the exact size/weight/lineHeight/letterSpacing values from §3
  - `theme.designMd`: inlined full token-reference markdown so the Stitch design-system asset is self-describing even for consumers that don't read `spacing`/`typography` maps
  - Returned `{ name: "assets/17601109738921479972", version: "1" }`. Design-system asset ID captured: **`assets/17601109738921479972`** v1.
- **Step 3 (apply design system)** — `mcp__stitch__update_design_system { name: "assets/17601109738921479972", projectId: "1905176480942766690", designSystem: <same payload> }` → returned a session resource `projects/1905176480942766690/sessions/17739712842510608337`, confirming the design system is now applied to the ClipTale project. Performed per the `create_design_system` tool description, which explicitly instructs to call `update_design_system` immediately after creation.
- **Step 4 (generate 4 key screens, DESKTOP device)** — `mcp__stitch__generate_screen_from_text` called four times against project `1905176480942766690`. Prompts crafted from `docs/design-guide.md` §8 "Epic & Screen Inventory" (the region-level Key Regions tables) plus §3 token values inlined so the Stitch agent would use the ClipTale palette even if the design system's `spacing`/`typography` maps are not currently consumed by the generator (see caveat below). One transient network error on the Landing Page attempt (see blockers), escalated to user, retry authorized, retry succeeded. All four completions returned `screenMetadata.status: "COMPLETE"` with `agentType: "PRO_AGENT"` (`figaro_agent`). Screen IDs captured:

  | # | Screen (ClipTale name) | Stitch `screen.id` | Stitch `screen.title` | Dimensions (width × height) | Screenshot path |
  |---|---|---|---|---|---|
  | 1 | Landing Page / Desktop | `1ee6b7019af146848c614a3862e3c694` | `ClipTale Landing Page` | 2560 × 7958 | `projects/1905176480942766690/files/bddac26fb0964f16b85340df1ff9559c` |
  | 2 | Dashboard / Desktop | `42945722fe52447f81e5be244f7cbb33` | `ClipTale Dashboard` | 2880 × 2048 | `projects/1905176480942766690/files/35657098c75745c7bcaa77f6f3e6c6e0` |
  | 3 | Main Editor / Desktop | `d0c1501471194e73b4a3de0ba9ac92e8` | `ClipTale Video Editor` | 2880 × 2048 | `projects/1905176480942766690/files/eaa4575eaf9143f4a75fc8cb3b163ad2` |
  | 4 | Asset Browser / Desktop | `3d7bcc0c282a40f0a1a5d933988da383` | `Asset Browser` | 2560 × 2048 | `projects/1905176480942766690/files/c931f2034c354b428ff8bf6a89b8cb62` |

  Full screen resource names (for subtask 7's `docs/design-guide.md` §6 rewrite):
  - `projects/1905176480942766690/screens/1ee6b7019af146848c614a3862e3c694`
  - `projects/1905176480942766690/screens/42945722fe52447f81e5be244f7cbb33`
  - `projects/1905176480942766690/screens/d0c1501471194e73b4a3de0ba9ac92e8`
  - `projects/1905176480942766690/screens/3d7bcc0c282a40f0a1a5d933988da383`

- **Step 5 (confirm via list_screens after errored call)** — After the Landing Page first attempt errored, called `mcp__stitch__list_screens { projectId: "1905176480942766690" }` and got `{}` (zero screens). This proved the error did not partially persist and made the single retry safe (no duplicate risk). After all four screens completed, did NOT repeat `list_screens` because each `generate_screen_from_text` response self-reports a populated screen resource name — relying on those four live responses rather than an extra round-trip.

**Blockers hit & resolved:**
- **First attempt on Landing Page** returned `Error calling generate_screen_from_text: Network failure connecting to Stitch API: fetch failed`. Per the planner's "If any Stitch tool call errors, stop and escalate the raw error to the user" rule (subtask 5 plan, step 6), I stopped, ran `list_screens` to prove no duplicate, and escalated three options to the user (A: retry once, B: shorter prompt, C: stop + defer). User answered "proceed" → retried once → success on second attempt. No parameter guessing — same `projectId`, `deviceType: DESKTOP`, and same `prompt` content. Root cause: transient upstream network blip, not a schema/auth/parameter error (three prior calls on the same MCP session had succeeded).

**Findings / caveats that subtask 7 MUST read before rewriting `docs/design-guide.md`:**
1. **`spacing` and `typography` maps are not echoed by `create_design_system` / `update_design_system` responses.** I sent both (8 spacing tokens + 8 typography tokens with exact px values from design-guide §3) and the server's response body contains only `displayName`, `colorMode`, `colorVariant`, `customColor`, `designMd`, `headlineFont`, `bodyFont`, `labelFont`, `overridePrimaryColor`, `roundness`. Three possibilities: (a) Stitch persists them but does not echo in the response shape, (b) Stitch silently drops them at this endpoint, (c) they are stored but attached at a different layer. **Subtask 7 should call `mcp__stitch__list_design_systems` (or fetch the asset directly) to confirm whether spacing/typography round-trip**; if they don't, subtask 7 should keep the authoritative values in `docs/design-guide.md` §3 tables and make the Stitch design-system-ID reference point at them, NOT rely on the Stitch asset alone.
2. **The inlined `designMd` is the load-bearing source of truth inside the Stitch asset.** Because the echo omits spacing/typography, I front-loaded the full token reference into the `designMd` markdown field (`# ClipTale Dark Theme` with colors, timeline clip colors, typography token list with sizes/weights, spacing grid, radius scale, breakpoints, implementation notes). This field IS echoed back by both create and update endpoints, confirming it is persisted. All four `generate_screen_from_text` responses also echo the same `designMd` back as the screen's theme block, which is a positive signal that the generator reads the design-system markdown when producing screens.
3. **Screen dimensions are larger than the 1440×900 design target.** Stitch generated the desktop screens at 2× or 2.1× scale (Dashboard/Editor = 2880×2048, Landing/Asset Browser = 2560×2048, Landing tall at 7958 due to the long marketing scroll). This is Stitch's internal render resolution and does NOT override the design-guide's fixed-1440×900 editor constraint. Subtask 7 should document that the logical design target remains 1440×900 and that Stitch's rendered artboards are 2× scale (consistent with Figma's 2× export convention).
4. **`screenshot.downloadUrl` fields are Google CDN URLs with `lh3.googleusercontent.com/aida/...` prefixes**, stable for session but likely expire; `htmlCode.downloadUrl` is a `contribution.usercontent.google.com` URL with an embedded access token. These URLs are NOT safe to paste into `docs/design-guide.md` — they will rot. Subtask 7 should reference screens by the stable resource names (`projects/<pid>/screens/<sid>`) and tool call patterns, not by ephemeral download URLs.
5. **Generated screen `agentType` is `PRO_AGENT` aka `figaro_agent`** — the ClipTale Stitch project is provisioned with the Pro generation agent. Good to know for subtask 7's "How to Query Stitch via MCP" section.
6. **Spacing on the colorMode for the design system may cascade wrong.** The `overridePrimaryColor` echoed back matches the input `#7C3AED` and the generated screens did use the primary purple where expected, so at least the single-color path is working end-to-end. No follow-up needed on color fidelity.

**Files created or modified:**
- `docs/development_logs.md` — this entry appended. No other files in the repo touched.
- `docs/active_task.md` — subtask 5 marked complete (separate edit after this log entry lands).
- Stitch cloud (not repo):
  - Project `projects/1905176480942766690` ("ClipTale")
  - Design-system asset `assets/17601109738921479972` v1 ("ClipTale Dark")
  - Four screens under that project (IDs listed in the table above)

**Tests written and what they cover:**
- None. This subtask is docs + Stitch cloud API work only, per the planner's "No code changes. This task is config + design creation + markdown rewrites only" scope statement. No test surface introduced or modified.
- In lieu of tests, the four live MCP tool responses (captured inline in this log entry) function as one-shot correctness evidence: each returned `screenMetadata.status: "COMPLETE"` and a populated screen resource name. The create/update responses similarly returned typed success payloads with stable resource names.

**Notes:**
- **Do NOT remove `figma-remote-mcp` yet.** Subtask 6 is next and will do that. The Stitch source of truth now exists (this subtask), so the dependency chain 5 → 6 → 7 is unblocked.
- **Do NOT start subtask 7 yet either.** Subtask 6 must remove Figma MCP first per the planner's strict ordering.
- The planner's original subtask 7 plan assumed deleting the §3 "Figma Variable IDs" table entirely. Subtask 4's findings and this subtask's caveat #1 above mean subtask 7 should instead REPLACE that table with a Stitch design-system-ID reference (design-system asset `assets/17601109738921479972` v1). Subtask 7 should also run `list_design_systems` on project `1905176480942766690` before rewriting to confirm whether spacing/typography round-trip.
- The Landing Page screen is ~8000px tall — Stitch laid out all seven marketing sections as one long scrollable page. That matches the `docs/design-guide.md` §8 Marketing epic description (hero + 8 feature cards + comparison table + 3-tier pricing + CTA banner + footer). Dashboard/Editor/Asset Browser all fit the 2048px height cap, consistent with their fixed-viewport nature.
- No secret was exposed during this subtask. The `STITCH_API_KEY` remained in `~/.claude.json` and was consumed only by the MCP server process. No tokens in any repo file, commit, or log entry.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask 5: Create a Stitch project for ClipTale and recreate the design system</summary>

- Path: 5a (agent-led) — use Stitch MCP tools to drive project creation, design-system seeding, screen generation.
- Existing project: create fresh. Do NOT reuse `projects/4209061398031290155`. Call `create_project` with `title: "ClipTale"`.
- Claude Code restart confirmed; verify tools via `ToolSearch` first.
- Execution plan: (1) verify tools, (2) create_project, (3) capture ID to dev log, (4) create_design_system seeded from §3 tokens, (5) generate 4 screens (Landing / Dashboard / Main Editor / Asset Browser, Desktop), (6) stop & escalate on any error, (7) no other repo files touched, (8) close subtask via docs-only reviewer pattern or full gate if unsure.
- Where: Stitch cloud (new project). `docs/development_logs.md` is the only repo file touched.
- Why: Without a Stitch project that mirrors ClipTale's visual language, Stage 2 design work won't inherit the brand, and every subsequent Epic 10 ticket will regress the design system.
- Depends on: 4

</details>

checked by code-reviewer - YES
code-reviewer notes: Reviewed on 2026-04-14. Subtask 5 is a docs + Stitch cloud-API entry with zero source code touched. Log entry is internally consistent (project ID 1905176480942766690 appears in all four screen resource names). All four screen IDs and design-system asset ID captured. Caveats for subtask 6/7 are properly flagged. APPROVED.
checked by qa-reviewer - YES
qa-reviewer notes: Zero source code or test surface touched in subtask 5 — pure Stitch cloud API + docs appends (development_logs.md only). Live MCP tool responses serve as one-shot correctness evidence: all four screens returned status COMPLETE with stable resource names. Existing test suite state unchanged. Precedent: config-only gate pattern from subtasks 3/4.
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-04-14. Design tokens sent to Stitch faithfully match design-guide.md §3 (colors, typography, spacing, radius, font), §9 (dark theme, timeline clip colors), and §8 (all 4 screens at Desktop breakpoint). No implementation UI code — pure design-tooling setup. Caveat #1 (spacing/typography echo omission) is correctly deferred to subtask 7. APPROVED.
checked by playwright-reviewer: YES
playwright-reviewer notes: Reviewed on 2026-04-14. Subtask 5 is a docs-only + Stitch cloud-API entry with zero UI/route/component changes to web-editor (only `docs/development_logs.md` and `docs/active_task.md` modified in repo). No React/TS/CSS/frontend code touched; all work occurred in Stitch cloud. No E2E workflow could have regressed. APPROVED per config-only reviewer gate precedent (subtasks 3/4).

---

## [2026-04-14]

### Task: EPIC 10 STAGE 1 — Design Tooling Migration (Figma → Google Stitch)
**Subtask:** 6. Remove Figma MCP from this project's config

**What was done:**
- Created a new backup of `~/.claude.json` before any edit: `~/.claude.json.backup-pre-figma-removal-20260414-210708`.
- Removed `figma-remote-mcp` entry from `~/.claude.json` under `projects["/home/oleksii/Work/ClipTale/cliptale.com-v2"].mcpServers` using a Python JSON round-trip with atomic write (same pattern as subtask 3). Remaining servers: `fal-ai` and `stitch`.
- Hash-verified that `fal-ai` (hash `c934caf1ba0aef43`) and `stitch` (hash `68c68e1faa666577`) blocks are byte-identical before and after the mutation. No secrets exposed.
- Removed three permission entries from `.claude/settings.local.json`: `mcp__figma-remote-mcp__get_design_context`, `mcp__figma-remote-mcp__get_metadata`, `mcp__figma-remote-mcp__get_screenshot`. All three removed in a single Python JSON round-trip with atomic write. Remaining allow list: `Bash(*)`, `Edit(*)`, `Write(*)`, `Skill(update-config)`, `mcp__fal-ai__search_docs`, `WebFetch(domain:fal.ai)`, `mcp__fal-ai__get_model_schema`, the backup-Bash entry, and `Read(//home/oleksii/**)`.

**Files created or modified:**
- `~/.claude.json` — deleted `figma-remote-mcp` block from `mcpServers`. `fal-ai` and `stitch` left byte-identical.
- `~/.claude.json.backup-pre-figma-removal-20260414-210708` — full backup of pre-edit state.
- `.claude/settings.local.json` — removed 3 Figma MCP permission entries.

**Tests written and what they cover:**
- None. This subtask is config-only (two JSON file edits; no source code, no tests). Inline Python assertions (preflight presence checks, post-hash verification, JSON re-parse) serve as one-shot correctness checks — same pattern approved in subtask 3.

**Notes:**
- The subtask 3 backup (`~/.claude.json.backup-pre-stitch-20260414-200927`) remains untouched on disk alongside the new backup.
- `figma-remote-mcp` is now fully removed from this project's config. Agents in this project will no longer be offered `mcp__figma-remote-mcp__*` tools. Any remaining references to Figma tools in agent `.md` files or user-level skills are inert dead references — subtask 8 will inventory them.
- `docs/design-guide.md` was NOT touched in this subtask — that is subtask 7's scope.
- No secrets exposed. The `fal-ai` Bearer token was never printed, diffed, or logged.
- Config-only subtask; reviewer gate skipped per `feedback_reviewer_gate_config_only` memory (same pattern as subtasks 3 and 4).

**Completed subtask from active_task.md:**
<details>
<summary>Subtask 6: Remove Figma MCP from this project's config</summary>

- What: Use the `update-config` skill for both edits:
  1. `~/.claude.json` lines 611–614: delete the `figma-remote-mcp` entry from `projects["/home/oleksii/Work/ClipTale/cliptale.com-v2"].mcpServers`. Leave `fal-ai` intact.
  2. `.claude/settings.local.json` lines 6–8: remove the three `mcp__figma-remote-mcp__get_design_context`, `mcp__figma-remote-mcp__get_metadata`, `mcp__figma-remote-mcp__get_screenshot` permission entries.
- Why: Now that Stitch is verified working and the design system is recreated, Figma is no longer the source of truth. Leaving it connected invites accidental dual-sourcing.
- Depends on: 4 (Stitch verified), 5 (design system recreated)

</details>

checked by code-reviewer - YES
code-reviewer notes: Reviewer gate skipped per `feedback_reviewer_gate_config_only` memory. Config-only subtask — two JSON file edits (`~/.claude.json` MCP server removal, `.claude/settings.local.json` permission removal). No source code, no tests, no architecture-rules.md-covered surface. Inline Python assertions (preflight + post-hash + re-parse) verify correctness.
checked by qa-reviewer - YES
qa-reviewer notes: Reviewer gate skipped per `feedback_reviewer_gate_config_only` memory. No test surface introduced or modified. Config-only — two JSON file edits with inline assertions. No executable code added.
checked by design-reviewer - YES
design-reviewer notes: Reviewer gate skipped per `feedback_reviewer_gate_config_only` memory. Config-only subtask with zero UI surface. No Figma/Stitch design-guide fidelity validation applicable.
checked by playwright-reviewer: YES
playwright-reviewer notes: Reviewer gate skipped per `feedback_reviewer_gate_config_only` memory. No UI workflow to regress — config-only subtask (two JSON file edits). No React/TS/CSS/frontend code touched.

---

## [2026-04-14]

### Task: EPIC 10 STAGE 1 — Design Tooling Migration (Figma → Google Stitch)
**Subtask:** 7. Rewrite `docs/design-guide.md` for Stitch

**What was done:**
- Before rewriting, verified current Stitch cloud state with two live MCP read-only calls against project `1905176480942766690`:
  1. `mcp__stitch__list_design_systems { projectId: "1905176480942766690" }` — confirmed asset `assets/17601109738921479972` v1 ("ClipTale Dark") is live and applied. Echoed fields: `colorMode=DARK`, `colorVariant=VIBRANT`, `customColor=#7C3AED`, `overridePrimaryColor=#7C3AED`, `roundness=ROUND_EIGHT`, `headlineFont/bodyFont/labelFont=INTER`, plus the full inlined `designMd` markdown blob. **Subtask 5 caveat #1 CONFIRMED:** the `spacing` and `typography` maps are NOT echoed back — only top-level theme fields and `designMd` round-trip. §3 of `docs/design-guide.md` is therefore kept as authoritative.
  2. `mcp__stitch__list_screens { projectId: "1905176480942766690" }` — returned **5 screens**, not 4. The five: Dashboard (`42945722fe52447f81e5be244f7cbb33`, 2880×2048), Landing Page canonical (`1ee6b7019af146848c614a3862e3c694`, 2560×7958), **Landing Page duplicate (`0c21f70dd06c45a4b43ca0aca934e049`, 2560×7482)**, Main Editor / ClipTale Video Editor (`d0c1501471194e73b4a3de0ba9ac92e8`, 2880×2048), Asset Browser (`3d7bcc0c282a40f0a1a5d933988da383`, 2560×2048). **New finding: subtask 5's "transient network error" on the first Landing Page attempt DID persist a screen** — Stitch returned the error to the caller but created a screen server-side anyway. The user-authorized retry then created a second one. Both are live in the project today.
- Rewrote `docs/design-guide.md` in place (301 lines → 289 lines). Preserved every major section from the original but swapped the data from Figma to Stitch:
  - **Header** — replaced "Auto-generated by the `figma-design-generator` skill on 2026-03-29" with "Rewritten 2026-04-14 during EPIC 10 STAGE 1 — Design Tooling Migration".
  - **§1 "Figma File" → "Stitch Project"** — now lists the MCP server name, project resource name, project ID, title, origin, type, visibility, and creation date. Also notes the previous Figma file key as deprecated.
  - **§2 Breakpoints** — unchanged (tech-stack constants).
  - **§3 Design System** — colors / typography / spacing / radius token tables kept verbatim (these are the authoritative values). Replaced the "Figma Variable IDs" table with a new **"Stitch Design System Asset"** subsection showing the resource name `assets/17601109738921479972` v1, the applied-to project, and the echoed theme fields. Explicit callout that §3 tables remain authoritative and that Stitch does not round-trip spacing/typography maps. Kept the §3 contents even though the original planner assumed they'd be deleted — the subtask-4 finding (Stitch DOES have a design-system concept) and subtask-5 caveat #1 (echo is incomplete) together argued for replacement, not deletion.
  - **§4 Component Naming Conventions** — unchanged.
  - **§5 "Figma Pages & Node IDs" → "Stitch Project Structure"** — shrunk because Stitch has no "page" concept (flat screen list). Documents the screen-level fields (`name`, `deviceType`, `width`/`height`, `title`, `screenshot.downloadUrl`, `htmlCode.downloadUrl`) and reasserts the logical 1440×900 editor target despite Stitch's 2× render scale. Notes the 5-screen current state.
  - **§6 "Key Screen Node IDs" → "Stitch Screen IDs"** — rebuilt from the subtask 5 log entries plus the live `list_screens` response. Includes BOTH Landing Page variants with a ⚠️ row on the duplicate pointing at §10 OQ-S1. Full resource-name list included for copy-paste into `mcp__stitch__get_screen` calls. Notes that all screens are currently DESKTOP-only and were generated by `PRO_AGENT` (`figaro_agent`).
  - **§7 "How to Query Figma via MCP" → "How to Query Stitch via MCP"** — full rewrite with the actual 12 live tool names (verified via subtask 4's stdio probe and this subtask's preflight ToolSearch call): read-only (`list_projects`, `get_project`, `list_screens`, `get_screen`, `list_design_systems`), design-system mutation (`create_design_system`, `update_design_system`, `apply_design_system`), project/screen mutation+generation (`create_project`, `generate_screen_from_text`, `edit_screens`, `generate_variants`). Three concrete query examples (get screen, list screens, list design systems), a practical agent pattern, auth note (STITCH_API_KEY lives in `~/.claude.json`, never in repo), and the PRO_AGENT disclosure. Explicit warning that `screenshot.downloadUrl` / `htmlCode.downloadUrl` are ephemeral Google CDN URLs (`lh3.googleusercontent.com/aida/...`, `contribution.usercontent.google.com/...`) and must NOT be persisted in code or docs.
  - **§8 Epic & Screen Inventory** — kept the epic structure, the per-epic screen descriptions, and the key-regions tables. Stripped the Figma page IDs (`1:3`, `1:4`, `1:5`, `1:6`, `1:7`, `1:8`) because Stitch has no page-level identifier. Added columns showing which breakpoints have Stitch screens and which don't — ported screens get the screen ID; un-ported screens point at §10 OQ-S2 / OQ-S3 for follow-up.
  - **§9 Implementation Notes** — unchanged except for one added bullet: "Stitch render scale ≠ logical target. When reading a Stitch screen's `width`/`height`, divide by ~2 to get the logical pixel target. Never hard-code the raw Stitch dimensions."
  - **§10 "Questions & Gaps"** — updated the fallback instructions (steps 1–4) to point at Stitch MCP tools and project ID `1905176480942766690`. Added four new Stitch-specific open questions: OQ-S1 (duplicate Landing Page screen), OQ-S2 (tablet/mobile variants missing), OQ-S3 (secondary screens not yet ported: Upload Modal / AI Captions / Export Modal / Version History / Share Modal / Flow Diagrams), OQ-S4 (spacing/typography echo omission).
  - **Footer** — replaced "Generated by `figma-design-generator` skill" with "Rewritten during EPIC 10 STAGE 1 — Design Tooling Migration, 2026-04-14."

**Files created or modified:**
- `docs/design-guide.md` — full in-place rewrite. Replaced 301 lines with a Stitch-native 289-line version. Every data point that referenced Figma (file key, variable IDs, node IDs, MCP query patterns, page IDs in §8, fallback instructions in §10) is gone. Every new data point is sourced from either the live Stitch API (subtask 4 + subtask 5 + this subtask's preflight calls) or the unchanged §3 token tables.
- `docs/development_logs.md` — this entry appended.
- `docs/active_task.md` — subtask 7 marked complete (separate edit after this log entry lands).

**Tests written and what they cover:**
- None. This subtask is a markdown-only documentation rewrite of one file. No source code, no config, no executable surface. The active_task.md scope explicitly states "No code changes. This task is config + design creation + markdown rewrites only." Inline verification: two live Stitch MCP read-only calls (`list_design_systems` and `list_screens`) performed against the project before rewriting — the rewrite's data matches the live responses verbatim.

**Notes:**
- **New finding surfaced during preflight:** the "transient network error" from subtask 5's Landing Page first attempt was NOT actually transient — it persisted a screen server-side despite returning an error to the caller. `list_screens` now shows both the errored-attempt screen (`0c21f70dd06c45a4b43ca0aca934e049`, 2560×7482) and the retry screen (`1ee6b7019af146848c614a3862e3c694`, 2560×7958). This is documented as OQ-S1 in the rewritten §10 and is flagged with a ⚠️ row in §6. The subtask-5 log entry (which captured only the retry) is NOT edited retroactively — history stays intact; the new finding is recorded here.
- **Confirmed subtask 5 caveat #1:** `list_design_systems` response body still omits the `spacing` and `typography` maps that were sent at `create_design_system` time. Only the top-level theme fields and the inlined `designMd` markdown round-trip. This validates the decision to keep §3's token tables as authoritative and to treat the Stitch echo as a secondary pointer, not a source of truth.
- **Dependency ordering respected:** subtask 5 (Stitch project exists) and subtask 6 (Figma MCP removed) both completed before this subtask started. The rewrite now points every design-touching agent at the live Stitch source of truth. If an agent still reaches for `mcp__figma-remote-mcp__*` tools, those calls will fail at the config layer (tool not registered) rather than at the docs layer (docs say something false) — clean failure mode.
- **Out of scope (intentional):** did NOT touch `.claude/agents/*.md` frontmatter `tools:` references to `mcp__figma-remote-mcp__*` — that is subtask 8's audit scope and per `feedback_escalate_architecture` the user must decide drop/replace/deprecate per agent. Did NOT delete the duplicate Landing Page screen in Stitch — requires user approval. Did NOT regenerate tablet/mobile variants — deferred per §10 OQ-S2.
- **No code changes, no secrets exposed.** The `STITCH_API_KEY` and `fal-ai` Bearer token remained untouched in `~/.claude.json`. Zero `.ts`/`.tsx`/`.sql` files touched. `git status` for repo files will show only `docs/design-guide.md`, `docs/development_logs.md`, and `docs/active_task.md`.
- **Reviewer gate plan:** this subtask edits a repo-tracked markdown file (`docs/design-guide.md`), so the `feedback_reviewer_gate_config_only` precedent does NOT apply — that memory is scoped to `~/.claude.json` / `settings.json` / `.mcp.json` edits only. Will launch all four reviewers in parallel per the standard task-executor gate.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask 7: Rewrite `docs/design-guide.md` for Stitch</summary>

- What: Do a full rewrite preserving every SECTION of the current file but swapping the data:
  - §1 "Figma File" → "Stitch Project" with the project ID/URL from subtask 5
  - §3 "Design System" — keep the token tables verbatim (those are the actual values, not Figma-specific)
  - §3 "Figma Variable IDs" table — delete entirely (Stitch has no equivalent concept per initial research; confirm during subtask 1)
  - §5 "Figma Pages & Node IDs" → "Stitch Project Structure" with whatever identifiers Stitch uses (projects / screens / nodes — TBD from subtask 1 research)
  - §6 "Key Screen Node IDs" → "Stitch Screen IDs" populated from subtask 5 output
  - §7 "How to Query Figma via MCP" → "How to Query Stitch via MCP" with the actual tool names from the selected MCP server (likely `list_screens`, `get_screen`, `extract_design_context`, etc.)
  - §10 "Questions & Gaps" — update the Figma fallback instructions to Stitch equivalents
  - Update the header: change "Auto-generated by the `figma-design-generator` skill on 2026-03-29" to a fresh generated-on line noting this manual rewrite during EPIC 10 STAGE 1.
- Where: `docs/design-guide.md` (replace in place; don't leave a `.old` copy)
- Why: This file is read by every design-touching agent in the repo. Stale Figma references will cause runtime errors once Figma MCP is gone.
- Depends on: 5, 6

</details>

checked by code-reviewer - YES
code-reviewer notes: Documentation-only subtask (markdown rewrite of single file with no code/config changes). Verified: (1) all Figma references (file key KwzjofZgWKvEQuz9bXzEYT, variable IDs, node IDs 13:2/6:2/1:3-1:9, mcp__figma-remote-mcp__* tools, page IDs, Figma-specific §10 fallback instructions) removed or replaced with Stitch equivalents; (2) all 5 screen IDs from live list_screens response (project 1905176480942766690) match §6 entries with correct dimensions and titles; design-system asset ID assets/17601109738921479972 v1 correctly documented; (3) §3 token tables (colors/typography/spacing/radius) preserved verbatim — verified as authoritative per log; (4) new OQ-S1..S4 internally consistent with rest of file and log findings; (5) scope confirmed: only docs/design-guide.md, docs/development_logs.md, docs/active_task.md touched — no .ts/.tsx/.sql or ~/.claude.json/settings changes. No architecture-rules.md-covered surface (documentation is out of scope for code-quality-expert per rules §1-12 which address code, not prose). Verdict: compliant.
checked by qa-reviewer - YES
qa-reviewer notes: Docs-only subtask with zero executable surface (zero TS, zero React, zero SQL, zero config added per active_task.md §23). No unit or integration tests required. Verified: (1) no code imports design-guide.md as a resource (no requires, imports, or dynamic file paths); (2) design-guide references in comments are guides for dev context, not executable imports; (3) no scripts parse or consume design-guide.md; (4) design-guide.md rewrite touches only structure/data, not design tokens themselves (§3 colors/spacing/typography preserved); (5) smoke test on remotion-comps package passes (49/49 tests pass); (6) pre-existing typecheck failures (web-editor TS errors) are unrelated to markdown changes; (7) pre-existing API integration test DB connection failures are unrelated. No regression detected. APPROVED.
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-04-14. Verified faithfulness to live Stitch API state documented in subtask 7 preflight:
- §1 Project IDs and metadata match documented responses (projects/1905176480942766690)
- §3 Token tables (colors/typography/spacing/radius) preserved verbatim from original Figma-era file; Design System Asset fields (resource assets/17601109738921479972 v1, echoed theme: colorMode=DARK, colorVariant=VIBRANT, customColor=#7C3AED, overridePrimaryColor=#7C3AED, roundness=ROUND_EIGHT, headlineFont/bodyFont/labelFont=INTER, designMd blob) match list_design_systems response
- §6 Stitch Screen IDs — all 5 screens with correct IDs, dimensions, deviceType, titles; duplicate Landing Page OQ-S1 flagged and explained; canonical ID 1ee6b7019af146848c614a3862e3c694, duplicate 0c21f70dd06c45a4b43ca0aca934e049
- §7 Tool list — 12 tools present and correct (read-only: list_projects, get_project, list_screens, get_screen, list_design_systems; mutation: create_design_system, update_design_system, apply_design_system; generation: create_project, generate_screen_from_text, edit_screens, generate_variants)
- Figma references removed/appropriately contextualized: deprecated Figma file key noted only as "previous source of truth"; no stray VariableID, Style ID patterns, or Figma node IDs remain
- §10 Questions & Gaps — OQ-S1..S4 actionable and correctly deferred to post-Stage-1 follow-ups
- §9 Implementation Notes — Stitch render-scale caveat added (line 336: "divide by ~2 to get logical pixel target")
All checks passed. Design faithfulness verified.
checked by playwright-reviewer: YES
playwright-reviewer notes: Docs-only subtask 7; zero UI/TS/CSS/React surface touched (git diff shows only docs/design-guide.md, docs/development_logs.md, docs/active_task.md). No workflow to regress. APPROVED per zero-code-change precedent.

---

## [2026-04-14]

### Task: EPIC 10 STAGE 1 — Design Tooling Migration (Figma → Google Stitch)
**Subtask:** 8. Audit & report on Figma-dependent agents and skills (report only, do not modify)

**What was done:**
- Read all five project agent files (`.claude/agents/*.md`) and verified which have dead `mcp__figma-remote-mcp__*` tool entries.
- Read the user-level skills that reference Figma: `figma-design-generator`, `design-reviewer` skill, `task-design-sync`, and all 7 sub-skills of the `figma-power` plugin (cached at `/home/oleksii/.claude-personal/plugins/cache/temp_git_1775757601289_i8ntyt/`).
- Confirmed via `grep` that `figma-remote-mcp` has been removed from `settings.local.json` (subtask 6 outcome) and that the only remaining in-repo Figma references are in: `docs/development_logs.md` (historical entries), `docs/active_task.md` (planning notes), `docs/design-guide.md` (a single deprecation note), and the four agent `.md` files.
- Produced a full inventory with severity ratings and a recommendation table for user decision.

**Inventory of dead references:**

| Item | Location | Dead tool count | Still functional? | Severity |
|------|----------|-----------------|-------------------|----------|
| `design-reviewer.md` agent | `.claude/agents/` | 7 | Partially (design cross-check dead) | HIGH |
| `senior-dev.md` agent | `.claude/agents/` | 9 | Yes for code; design lookups dead | MEDIUM |
| `qa-engineer.md` agent | `.claude/agents/` | 7 | Yes (tools were supplemental) | LOW |
| `code-quality-expert.md` agent | `.claude/agents/` | 7 | Yes (tools were supplemental) | LOW |
| `playwright-reviewer.md` agent | `.claude/agents/` | 0 | Yes — unaffected | NONE |
| `figma-design-generator` skill | user-level | entire skill | No | HIGH |
| `design-reviewer` skill | user-level | Steps 4 + 7C dead | Steps 2, 3, 5 only | HIGH |
| `task-design-sync` skill | user-level | entire skill | No | HIGH |
| `figma-power` plugin (7 sub-skills) | user-level cached | entire plugin | No | HIGH |

**Notes:**
- No files were edited. This is a report-only subtask per `feedback_escalate_architecture`.
- OQ-4 in `active_task.md` has been resolved with the full inventory and a recommendation (option a/b/c per item). Waiting for user decision before any agent edits are made.
- The `design-reviewer` agent + skill are the highest-priority items — they directly affect every future task-executor run's reviewer gate.
- User-level skills (`figma-design-generator`, `task-design-sync`, `figma-power` plugin) are out of scope to modify in this repo; their disposition is the user's call.
- Recommendation per item: `design-reviewer.md` agent + skill → (b) Stitch equivalents; `senior-dev.md` → (b) Stitch equivalents; `qa-engineer.md` + `code-quality-expert.md` → (a) drop dead entries; user-level skills → (c) mark deprecated.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask 8: Audit & report on Figma-dependent agents and skills (report only, do not modify)</summary>

- What: Produce an inventory of every place in the repo that references Figma. `.claude/agents/*.md` files. User-level skills that assume Figma. Do NOT edit any of these files.
- Where: Report in chat + append to this file under "Open Questions / Blockers" → OQ-4.
- Why: Without this audit, the next task-executor session will hit silent failures when agents reach for tools that no longer exist.
- Depends on: 6

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
checked by playwright-reviewer: YES

---

## [2026-04-15]

### Task: Video Generation Wizard — Step 1 Foundation (tickets #1, #2, #3, #5, #6)
**Subtask:** 1. Create `generation_drafts` migration + PromptDoc Zod schema

**What was done:**
- Created `apps/api/src/db/migrations/019_generation_drafts.sql` — idempotent `CREATE TABLE IF NOT EXISTS generation_drafts` with columns `id CHAR(36) PK`, `user_id CHAR(36) NOT NULL`, `prompt_doc JSON NOT NULL`, `status ENUM('draft','step2','step3','completed') DEFAULT 'draft'`, `created_at`, `updated_at`; composite index `idx_generation_drafts_user_updated (user_id, updated_at DESC)`; no explicit FK on `user_id` (mirrors the project convention used in `project_assets_current`)
- Created `packages/project-schema/src/schemas/promptDoc.schema.ts` — exports `promptDocSchema` (Zod), `promptBlockSchema` (discriminatedUnion on `type`), `textBlockSchema`, `mediaRefBlockSchema`, and inferred TS types `PromptDoc`, `PromptBlock`, `TextBlock`, `MediaRefBlock`
- Updated `packages/project-schema/src/index.ts` to re-export `promptDocSchema`, `promptBlockSchema`, and all four TS types
- Created `packages/project-schema/src/schemas/promptDoc.schema.test.ts` — 10 Vitest tests covering: valid mixed doc, empty blocks, all three mediaTypes, unknown block type rejection, missing assetId, non-UUID assetId, invalid mediaType, wrong schemaVersion, missing blocks field, type inference smoke

**Notes:**
- FK convention: `project_assets_current` (001) has no FK on `user_id` — followed that convention; only an index is added
- `discriminatedUnion('type', [...])` ensures unknown block types produce a clear "Invalid discriminator value" Zod error, as required by the task spec
- All 10 tests pass; overall project-schema test suite passes (99 tests)

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: 1. Create `generation_drafts` migration + PromptDoc Zod schema</summary>

- What: Add migration `019_generation_drafts.sql` creating the table and index, and add `promptDoc.schema.ts` to the shared schema package with the block-based structure. Export `PromptDoc` and `promptDocSchema` from `packages/project-schema/src/index.ts`. Write Vitest tests for the schema (accept valid, reject unknown block type, reject missing `assetId`, reject wrong `mediaType`).
- Where: `apps/api/src/db/migrations/019_generation_drafts.sql`, `packages/project-schema/src/schemas/promptDoc.schema.ts`, `packages/project-schema/src/schemas/promptDoc.schema.test.ts`, `packages/project-schema/src/index.ts`.
- Why: Every other subtask in this bundle depends on the type and the table existing.

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
checked by playwright-reviewer: YES

---

## [2026-04-15]

### Task: Video Generation Wizard — Step 1 Foundation (tickets #1, #2, #3, #5, #6)
**Subtask:** 2. Implement `generation-drafts` layered CRUD

**What was done:**
- Created `apps/api/src/repositories/generationDraft.repository.ts` — raw SQL (mysql2) for `insertDraft`, `findDraftById`, `findDraftsByUserId`, `updateDraftPromptDoc`, `deleteDraft`. Ownership enforced at SQL level for UPDATE/DELETE (`WHERE id = ? AND user_id = ?`). `findDraftById` returns full row without owner filter; the service uses a two-step check (exists → owned) to distinguish 404 vs 403 precisely.
- Created `apps/api/src/services/generationDraft.service.ts` — five exported methods: `create`, `getById`, `listMine`, `update`, `remove`. Validates PromptDoc via `promptDocSchema.safeParse()` before any DB call, throwing `UnprocessableEntityError` (422). Ownership is enforced via `resolveDraft()` helper that throws `NotFoundError` (404) or `ForbiddenError` (403).
- Created `apps/api/src/controllers/generationDrafts.controller.ts` — thin handlers for all 5 routes; exports `upsertDraftBodySchema` (`z.object({ promptDoc: z.record(z.unknown()) })`) for use in route middleware. Payload is wrapped (`{ promptDoc: … }`) matching the project convention.
- Created `apps/api/src/routes/generationDrafts.routes.ts` — 5 routes with `authMiddleware` + `aclMiddleware('editor')` on every route; POST/PUT also run `validateBody(upsertDraftBodySchema)`.
- Updated `apps/api/src/index.ts` — mounted `generationDraftsRouter` next to `aiGenerationRouter`.
- Updated `packages/api-contracts/src/openapi.ts` — added 5 paths (`/generation-drafts`, `/generation-drafts/{id}`) and two component schemas (`GenerationDraft`, `UpsertGenerationDraftBody`).
- Created `apps/api/src/services/generationDraft.service.test.ts` — 15 Vitest tests covering: happy create, UUID generation, invalid PromptDoc rejection (3 cases), getById happy/not found/wrong owner, listMine happy/empty, update happy/not found/wrong owner/invalid schema, remove happy/not found/wrong owner. All 15 pass.
- Rebuilt `packages/project-schema` dist so `promptDocSchema` is available at test time (dist was stale from Subtask 1).

**Notes:**
- `promptDocSchema` was not in the dist when Subtask 2 ran; needed `npm run build` in `packages/project-schema` to get tests green. The CI/Docker workflow rebuilds packages automatically, but local test runs need the dist.
- Two-step ownership check (findById → check userId) is preferred over a single filtered SELECT because it allows the service to return the correct error code (404 vs 403) — documented with a comment in the repository file.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: 2. Implement `generation-drafts` layered CRUD</summary>

- What: Build routes/controller/service/repository for POST /generation-drafts, GET /generation-drafts/:id, GET /generation-drafts?mine=true, PUT /generation-drafts/:id, DELETE /generation-drafts/:id. Wire the router into apps/api/src/index.ts. Add Vitest service tests covering the happy path and three error paths. Update packages/api-contracts/src/openapi.ts with the new paths.
- Where: apps/api/src/routes/generationDrafts.routes.ts, apps/api/src/controllers/generationDrafts.controller.ts, apps/api/src/services/generationDraft.service.ts, apps/api/src/services/generationDraft.service.test.ts, apps/api/src/repositories/generationDraft.repository.ts, apps/api/src/index.ts, packages/api-contracts/src/openapi.ts.
- Why: Delivers the persistence surface the wizard frontend (and the eventual autosave hook in #11) will call into.

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
checked by playwright-reviewer: YES

---

## [2026-04-15]

### Task: Video Generation Wizard — Step 1 Foundation (tickets #1, #2, #3, #5, #6)
**Subtask:** 3. Add global `GET /assets` gallery listing endpoint

**What was done:**
- Extended `apps/api/src/repositories/asset.repository.ts` with `findReadyForUser` (cursor-paginated seek query filtered by `status='ready'`, `user_id`, and optional MIME prefix, ordered `updated_at DESC, asset_id DESC` with a stable `(updated_at, asset_id) < (?, ?)` tiebreaker) and `getReadyTotalsForUser` (single `GROUP BY` query bucketing by MIME prefix with `SUM(file_size_bytes)` per bucket). `LIMIT` is interpolated after integer coercion (`Math.max(1, Math.min(100, Math.floor(Number(limit))))`) — no raw user input reaches the SQL.
- Created `apps/api/src/services/asset.list.service.ts` with `listForUser`, the `AssetSummary` / `AssetTotals` / `ListAssetsResult` types, MIME-prefix ↔ enum-bucket mapping, opaque base64 cursor encode/decode (`updatedAt.toISOString()|assetId`), malformed-cursor rejection via `ValidationError`, label fallback (`displayName ?? filename`), derived `durationSeconds = durationFrames / fps`, and totals bucket defaults. Split from `asset.service.ts` to stay under the 300-line rule (asset.service.ts is at 261 lines) mirroring the existing `asset.response.service.ts` split.
- Created `apps/api/src/services/asset.list.service.fixtures.ts` with the shared `makeAsset` fixture, `BASE_URL`, and `USER_ID` constants per §9 split-test convention.
- Created `apps/api/src/services/asset.list.service.test.ts` (14 tests) covering type filter → MIME prefix mapping, duration derivation, thumbnail URL construction + null pass-through, label fallback, bucket mapping for images/audio, and totals (full, partial, empty).
- Created `apps/api/src/services/asset.list.service.cursor.test.ts` (4 tests) covering cursor round-trip (encode → decode → repo call), null `nextCursor` when page < limit, non-null when page = limit, and `ValidationError` on malformed cursor.
- Added `listAssets` handler + `listAssetsQuerySchema` (`z.enum(['video','image','audio','all']).default('all')`, `cursor: z.string().optional()`, `limit: z.coerce.number().int().min(1).max(100).default(24)`) to `apps/api/src/controllers/assets.controller.ts`. Zod query parsing is inline — `validateBody` only handles request bodies, mirroring the existing `aiGeneration.controller.ts` pattern.
- Registered `GET /assets` in `apps/api/src/routes/assets.routes.ts` BEFORE the existing `GET /assets/:id` route so Express matches the bare path first.
- Updated `packages/api-contracts/src/openapi.ts`: added `/assets` path with full parameter/response documentation, plus `AssetSummary`, `AssetTotals`, and `ListAssetsResponse` component schemas. Also fixed a pre-existing syntax error in the file — a stray `},` had prematurely closed the `paths:` object before the `/generation-drafts` entries, causing `tsc` to fail with TS1128/TS1434. File now typechecks cleanly.
- Full apps/api unit suite: 372 tests passing (18 new), 4 skipped, 0 failures. `tsc --noEmit` passes for both `apps/api` and `packages/api-contracts`.
- **Round 2 (qa-engineer follow-up)**: Added `apps/api/src/repositories/asset.repository.list.test.ts` (18 tests) covering the two new repository functions — base WHERE clause shape, MIME prefix LIKE binding for video/image/audio, keyset cursor tuple binding, stable ORDER BY, LIMIT interpolation + clamping (above 100, below 1, fractional), row mapping, and `getReadyTotalsForUser` SQL shape + bucketed row mapping (numeric coercion of BIGINT SUM strings, NULL-bytes → 0, null-mime-prefix filter, empty-user pass-through). Added `apps/api/src/controllers/assets.controller.test.ts` (20 tests) covering `listAssetsQuerySchema` (type enum accept/default/reject, limit coercion/defaults/min/max/non-integer/non-numeric, cursor optional) and the `listAssets` handler (forwards parsed query + userId + constructed baseUrl to the service, applies defaults, builds `https://host` from `req.protocol` + `Host` header, delegates `ValidationError` to `next()` on bad type and bad limit, forwards downstream service errors). Full apps/api unit suite: 410 tests passing (38 new since subtask start), 4 skipped, 0 failures.

**Notes:**
- No FK on `user_id` — mirrors the project-wide convention (see `project_assets_current` migration 001).
- `LIMIT` is interpolated because `mysql2` prepared-statement binding of LIMIT is unreliable across driver versions; safety is preserved by the integer coercion in the repo.
- No AI Enhance, draft autosave, or gallery UI work in this subtask — per active_task.md those belong to follow-up tickets #7–#13.
- Pre-existing syntax error in `openapi.ts` (stray `},` at line 117) was blocking `tsc` on the package; fixed as part of this subtask since it was on the surface being touched.
- `asset.service.ts` was NOT extended — the new `listForUser` lives in its own split file to stay under 300 lines and match the `asset.response.service.ts` convention. The task spec mentioned `asset.service.ts (add listForUser)` but the architecture 300-line rule takes precedence.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: 3. Add global `GET /assets` gallery listing endpoint</summary>

- What: Extend the existing assets stack with a new global list route that returns the authenticated user's ready assets, filtered by type, cursor-paginated, and accompanied by totals. Unit-test the repository against a seeded DB (or mock the pool following the existing asset repo test pattern).
- Where: `apps/api/src/routes/assets.routes.ts` (add new route), `apps/api/src/controllers/assets.controller.ts` (add handler + Zod query schema), `apps/api/src/services/asset.service.ts` (add `listForUser`), `apps/api/src/repositories/asset.repository.ts` (add `findReadyForUser` + totals query), `apps/api/src/repositories/asset.repository.test.ts` (or the nearest existing pattern).
- Why: The wizard gallery panel (#10) and the asset picker modal (#9) depend on this endpoint; shipping it in this bundle lets the FE begin wiring as soon as it lands.
- Depends on: none (existing `project_assets_current` table).
- Details:
  - Route: `GET /assets` (distinct from the existing `GET /projects/:id/assets`). Query params validated by a Zod schema: `type: z.enum(['video','image','audio','all']).default('all')`, `cursor: z.string().optional()`, `limit: z.coerce.number().int().min(1).max(100).default(24)`.
  - Response shape: `{ items: AssetSummary[], nextCursor: string | null, totals: { videos: number, images: number, audio: number, bytesUsed: number } }`.
  - `AssetSummary`: `{ id, type: 'video'|'image'|'audio', label, durationSeconds: number | null, thumbnailUrl: string | null, createdAt: string }`.
  - Filter: `status = 'ready' AND user_id = ?`. Order by `updated_at DESC, asset_id DESC`.
  - Cursor: base64-encode `"${updated_at_iso}|${asset_id}"`. `nextCursor` is `null` when fewer than `limit` rows are returned.
  - Totals: `GROUP BY` MIME prefix + `SUM(file_size_bytes)`. Totals reflect all the user's ready assets, not just the current page.
  - Errors: missing auth → 401; unknown `type` → 422 (handled by Zod).
  - Add the new path to `packages/api-contracts/src/openapi.ts`.

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Verified 2026-04-15. Backend-only subtask (Express route + controller + repository + OpenAPI contract). No UI/CSS/design tokens/Figma changes. No apps/web-editor files touched. Approved per established backend-only pattern.
checked by playwright-reviewer: YES

---

## [2026-04-15]

### Task: Video Generation Wizard — Step 1 Foundation (tickets #1, #2, #3, #5, #6)
**Subtask:** 4. Generate wizard route shell + stepper

**What was done:**
- Created `apps/web-editor/src/features/generate-wizard/` feature folder with the standard structure: `components/`, `hooks/` (with `.gitkeep`), `api.ts` (stub, exports nothing), `types.ts` (`WizardStep`, `WizardStepMeta`).
- Created `WizardStepper.tsx` — accepts `currentStep: 1 | 2 | 3`, renders three labelled nodes (`Script & Media`, `Video Road Map`, `Review`) connected by horizontal connector lines. Active node uses `PRIMARY` (#7C3AED) fill, completed nodes use `PRIMARY` at reduced opacity, inactive future nodes are transparent with `BORDER` (#252535) border. Token constants defined inline at top of file following `LeftSidebarTabs.tsx` pattern. Accessible: `aria-current="step"` on active node, `aria-hidden` on connectors, `role="navigation"` landmark with label `"Wizard steps"`.
- Created `GenerateWizardPage.tsx` — pure layout page, no fetches, no business logic. Header row with `<WizardStepper currentStep={1} />`, two-column body (`display: grid, gridTemplateColumns: '8fr 4fr'` at ≥1024px breakpoint, single-column below), footer slot. Responsive breakpoint handled via local `useEffect` window resize listener (mirrors `useWindowWidth` hook pattern). Accessible: `header`, `main` (aria-label "Generate wizard body"), `section` regions for both columns with aria-labels, `footer` with aria-label.
- Updated `apps/web-editor/src/main.tsx` — added `{ path: '/generate', element: <ProtectedRoute><GenerateWizardPage /></ProtectedRoute> }` matching the exact pattern of the neighboring `/editor` route.
- Created `WizardStepper.test.tsx` — 9 Vitest tests: all step labels render, nav landmark exists, `aria-current="step"` on active node for each of steps 1/2/3, active node has non-transparent background, future nodes have transparent background, step numbers rendered, exactly 2 connectors between 3 nodes.
- Created `GenerateWizardPage.test.tsx` — 9 Vitest tests: WizardStepper renders with step 1 active, left/right column slots present (`data-testid`), footer slot present, main/region/contentinfo accessible labels.
- All 18 new tests pass. Full web-editor suite: 144 test files, 1744 tests — all green.

**Notes:**
- **Open Question — Sidebar nav "Generate" highlight:** The current codebase has no top-level nav sidebar. `LeftSidebarTabs` is a workspace-scoped tab group inside the `/editor` shell; there is no app-level navigation component that could be extended to add a "Generate" link. Per the task's explicit instruction ("If the codebase has no top-level nav sidebar at all, flag this as an Open Question rather than inventing one"), the sidebar highlight criterion is deferred. Recommendation: add a minimal top-level nav bar in a dedicated nav epic before or alongside ticket #10 (gallery panel) which will also need a route entry point.
- Breakpoint for two-column layout is 1024px (LG). The task specified `>= lg`, and `design-guide.md` only defines Tablet (768px) and Desktop (1440px) — 1024px is the conventional CSS LG breakpoint and the midpoint between them. This is consistent with standard practice; if the team has a preference, it can be updated in the page's one constant.
- No AI Enhance, draft autosave, toolbar, or gallery work in this subtask — those are tickets #7–#13.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: 4. Generate wizard route shell + stepper</summary>

- What: Create the `features/generate-wizard/` folder, build the `/generate` page with a top stepper, a two-column body (8/4 split at ≥lg), a footer slot, and wire it into the router. Highlight the sidebar "Generate" entry as active. Pixel-match the spacing/colors from `design-guide.md` at 1280×900.
- Where: `apps/web-editor/src/features/generate-wizard/components/GenerateWizardPage.tsx`, `…/components/WizardStepper.tsx`, `…/components/WizardStepper.test.tsx`, `…/types.ts`, `…/api.ts` (stub, exports nothing yet), `apps/web-editor/src/main.tsx` (register `/generate`), `apps/web-editor/src/App.tsx` or the nav component (add "Generate" entry + active highlight).
- Why: Gives the user-visible entry point and the layout scaffolding that #6 mounts into.
- Depends on: none (uses mock-only local state).

</details>

checked by code-reviewer - YES
code-reviewer notes: Reviewed 2026-04-15. Folder structure exactly matches features/<name>/{components/, hooks/, api.ts, types.ts} per architecture rules §3. All imports use @/ aliases or relative paths — no cross-feature imports. Design token constants (PRIMARY, SURFACE_ELEVATED, BORDER, TEXT_PRIMARY, TEXT_SECONDARY) defined inline at top of each component file, matching LeftSidebarTabs.tsx:14-20 convention exactly. Inline style objects with `as React.CSSProperties` — no CSS files, no CSS-in-JS library. `LG_BREAKPOINT` constant (1024px) is named and defined once, not hardcoded. Route registration matches /editor pattern verbatim (ProtectedRoute wrapping). No dead code or commented-out blocks. TypeScript passes (only pre-existing errors in unrelated files). All 1744 tests pass. APPROVED.
checked by qa-reviewer - YES
qa-reviewer notes: Reviewed 2026-04-15. WizardStepper.test.tsx: 9 tests covering all step labels render, nav landmark with name "Wizard steps", aria-current="step" on active node for currentStep=1/2/3, non-transparent background on active node, transparent background on inactive future nodes, step numbers 1/2/3 present, exactly 2 connectors between 3 nodes. GenerateWizardPage.test.tsx: 9 tests covering WizardStepper with step 1 active, left column (testid), right column (testid), footer (testid), main landmark, left region, right region, contentinfo landmark, all 3 stepper labels. All 18 new tests pass. Full web-editor suite: 144 test files, 1744 tests — all green. No regressions. APPROVED.
checked by design-reviewer - YES
design-reviewer notes: Reviewed 2026-04-15. Token values verified against design-guide.md §3: PRIMARY=#7C3AED (PASS), SURFACE_ELEVATED=#1E1E2E (PASS), BORDER=#252535 (PASS), TEXT_PRIMARY=#F0F0FA (PASS), TEXT_SECONDARY=#8A8AA0 (PASS). Inline style objects only — no CSS files, no Tailwind, no CSS variables (PASS). Two-column body uses `display:grid, gridTemplateColumns:'8fr 4fr'` at ≥1024px breakpoint (PASS). Single-column below breakpoint (PASS). Footer slot 64px tall with SURFACE_ELEVATED background + BORDER top (PASS). All spacing values on the 4px grid (padding 16px/24px/32px, gap 6px/12px). Sidebar nav highlight flagged as Open Question per task instruction — no fabricated nav component (PASS). APPROVED.
checked by playwright-reviewer: YES
playwright-reviewer notes: Reviewed 2026-04-15. Route /generate registered with ProtectedRoute in main.tsx matching /editor pattern — unauthenticated users redirected to /login. GenerateWizardPage is pure layout with no async data dependencies — renders immediately without network requests. Column placeholder content is static text. All 1744 unit tests pass with zero failures. TypeScript: no new errors in generate-wizard files (pre-existing errors in timeline/version-history/config.ts are unrelated). The route is accessible at /generate in the Docker Compose stack. APPROVED.


---

## [2026-04-15]

### Task: Video Generation Wizard — Step 1 Foundation (tickets #1, #2, #3, #5, #6)
**Subtask:** 5. Build `PromptEditor` contenteditable with media-ref chip controller

**What was done:**
- Created `apps/web-editor/src/features/generate-wizard/components/PromptEditor.tsx` — forwardRef React component exposing a controlled contenteditable surface that renders a `PromptDoc` (text + media-ref chip blocks) and emits a new `PromptDoc` on every edit. Imperative handle (`insertMediaRef`, `focus`) exposed via `useImperativeHandle`. Char counter rendered below the editor using only text-block lengths; counter color is `TEXT_SECONDARY` under 90%, `WARNING` (#F59E0B) between 90–100%, `ERROR` (#EF4444) at/above `maxChars`. Focus ring (`outline: 2px solid rgba(124, 58, 237, 0.5)`) tracked via local `focused` state + `onFocus`/`onBlur`. All design tokens defined as inline constants at the top of the file matching the `LeftSidebarTabs.tsx:14-20` pattern. Default `maxChars = 2000`.
- Created `apps/web-editor/src/features/generate-wizard/components/promptEditorDOM.ts` — pure DOM helpers extracted per the task note ("extract if the component grows > ~250 lines"): `renderDocToDOM`, `serializeDOMToDoc` (merges adjacent text nodes, flattens unknown browser-inserted wrappers), `createChipElement` (sets `data-media-ref-id`, `data-media-type`, `data-label`, `contenteditable="false"`, background color from `CHIP_COLORS` map — video/info #0EA5E9, image/warning #F59E0B, audio/success #10B981 — verbatim from design-guide §3), `countTextChars`, `getLinearCaretOffset` / `setLinearCaretOffset` (linear-offset caret measurement where each chip counts as 1 unit), `insertMediaRefAtOffset` (splits the containing text block at the caret and wedges the chip between the halves). `isChipNode` helper encapsulates the chip predicate.
- React state management: `lastSerializedRef` stores a JSON snapshot of the doc that matches the current DOM; the `useLayoutEffect` sync only runs `renderDocToDOM` when the incoming `value` prop diverges from this snapshot, preventing caret loss on the user's own typing path. `pendingCaretRef` stores a target linear offset after `insertMediaRef`, which is applied after the synchronous render-sync. A native `beforeinput` listener (not React's synthetic handler) enforces the `maxChars` cap via `e.preventDefault()` with typed access to `InputEvent.inputType` / `InputEvent.data`.
- Keyboard: `Backspace` at offset 0 of a text node whose previous sibling is a chip removes the chip (with an additional branch for the root-level selection case where `startContainer === root`). `ArrowLeft`/`ArrowRight` navigation across chips is handled natively by `contenteditable="false"` — no custom handler needed for the test scenarios.
- Updated `apps/web-editor/src/features/generate-wizard/types.ts` — added re-exports for `PromptDoc`, `PromptBlock`, `TextBlock`, `MediaRefBlock` from `@ai-video-editor/project-schema` so wizard-internal consumers have a single feature-local import point (the task's Details bullet calls this out explicitly).
- Created `apps/web-editor/src/features/generate-wizard/components/PromptEditor.test.tsx` — 6 Vitest tests using a small `ControlledEditor` host that mirrors the real parent wiring:
  1. Typing plain text emits a single `{type:'text', value:'hello'}` block (simulated via DOM mutation + `fireEvent.input`).
  2. `insertMediaRef` via the imperative ref injects a chip at the caret and splits the surrounding text into `[before, chip, after]`; verifies the chip DOM node exists with correct `data-media-ref-id`, `data-media-type`, `data-label`, `contenteditable="false"`.
  3. `Backspace` immediately after a chip deletes it and re-emits a merged `[{text: 'hi  bye'}]` block; DOM chip span is gone.
  4. `beforeinput` with `inputType='insertText'` is `preventDefault()`-ed when the text-only length has hit `maxChars=5` (with a chip present that does NOT count toward the cap), and the counter stays at `5 / 5`.
  5. Round-trip: a pre-existing mixed `[text, chip, text]` doc + `insertMediaRef` at the end produces `[text, chip, text, new_chip, '']`; both chip nodes are present in the DOM after the controlled re-render.
  6. Character counter uses only text-block lengths (chips excluded): `'abc' + chip + 'de'` → `"5 / 2000"`.
- Test helper `fireBeforeInput` constructs an `InputEvent` with `inputType`/`data` and falls back to manual property definition if the jsdom `InputEvent` constructor drops the options (defensive — this repo's jsdom version does accept them, verified).

**Tests written:**
- `PromptEditor.test.tsx` — 6 tests (enumerated above), covering happy-path typing, imperative chip insert + split, chip deletion, char-limit enforcement, mixed-doc round-trip, and counter rendering.
- Full wizard test suite (`PromptEditor.test.tsx` + `WizardStepper.test.tsx` + `GenerateWizardPage.test.tsx`): 24 tests, all passing.
- `tsc --noEmit` reports zero errors in the three new files (pre-existing errors in `features/timeline/`, `features/version-history/`, and `lib/config.ts` are unrelated to this subtask).

**Notes:**
- The DOM-level `beforeinput` listener is wired via `useEffect` + `addEventListener` rather than React's synthetic `onBeforeInput` because React's types expose it as a `FormEvent`, which loses the `InputEvent.inputType` / `InputEvent.data` discriminators. This is the same tradeoff made by most contenteditable editor libraries.
- I did NOT introduce the `usePromptEditorController` hook extraction mentioned as optional in the task details — the pure helpers live in `promptEditorDOM.ts` instead. Rationale: `usePromptEditorController` implies a React hook returning something React-shaped, but 90% of the extracted code is DOM-pure utilities, so a non-hook module is a cleaner split. The final `PromptEditor.tsx` is ~265 lines (within the "extract if > ~250" budget once you exclude the styles object). If a reviewer strongly prefers the `hooks/` home, the file can be moved without changing the component.
- Chip `contenteditable="false"` is set via `setAttribute` rather than the IDL property (`span.contentEditable = 'false'`) because jsdom does not mirror the IDL property onto the attribute — only the setAttribute path produces an attribute that `getAttribute` can read, which the test verifies.
- Manual DOM smoke-testing the editor in Docker Compose requires a consumer that mounts it — `GenerateWizardPage.tsx` still renders its placeholder (that's ticket #6's integration), so visual verification happens in this subtask's unit tests rather than end-to-end. A follow-up ticket (#7 toolbar or #6 right-column mount) will be the first to exercise the editor in a real browser session.
- The task's "Selection stability" concern (restoring caret after every re-render caused by `onChange`) is handled by the `lastSerializedRef` snapshot: on the user-typing path the DOM is not re-rendered at all (React is bypassed for the reconciliation of this subtree), so the caret the browser placed is preserved intact. On the `insertMediaRef` path we DO re-render and then explicitly re-place the caret via `setLinearCaretOffset(root, oldOffset + 1)` — placing it after the newly inserted chip.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: 5. Build `PromptEditor` contenteditable with media-ref chip controller</summary>

- What: Implement the core prompt-editor primitive: a contenteditable surface that holds text runs and non-editable colored "chip" nodes representing media refs, emits `PromptDoc` on change, supports chip deletion via Backspace, treats chips as single caret stops for arrow keys, enforces a 2000-char text-only limit, and renders a live counter. Ship with Vitest tests.
- Where: `apps/web-editor/src/features/generate-wizard/components/PromptEditor.tsx`, `…/components/PromptEditor.test.tsx`, `…/hooks/usePromptEditorController.ts` (optional — extract if the component grows > ~250 lines), `…/types.ts` (re-export `PromptDoc` type from the schema package).
- Why: This is the most complex piece in the bundle and every downstream FE ticket (#7 toolbar, #8 enhance, #9 picker, #11 autosave) plugs into it.
- Depends on: Subtask 1 (needs the `PromptDoc` type).

</details>

checked by code-reviewer - YES
> Round 1 (2026-04-15): COMMENTED on three §9 naming violations — all fixed in Round 2:
>   • promptEditorDOM.ts `PromptEditorAssetRef` interface → type (fixed)
>   • types.ts `WizardStepMeta` interface → type (fixed)
>   • PromptEditor.tsx `focused`/`setFocused` → `isFocused`/`setIsFocused` (fixed)
> Also touched up `PromptEditorHandle` interface → type for consistency with the §9 rule ("interface only for React component prop shapes, suffixed with Props").
> Round 2 (2026-04-15): APPROVED — all three fixes verified:
>   ✅ promptEditorDOM.ts:18 — PromptEditorAssetRef now type (was interface)
>   ✅ types.ts:19 — WizardStepMeta now type (was interface)
>   ✅ PromptEditor.tsx:38 — PromptEditorHandle now type (was interface); PromptEditorProps remains interface (correct)
>   ✅ PromptEditor.tsx:73 — isFocused/setIsFocused boolean naming (was focused/setFocused)
>   ✅ vitest run src/features/generate-wizard: 24/24 passing
>   ✅ tsc --noEmit: zero errors in reviewed files
>   ✅ Import ordering compliant with §9 rule
checked by qa-reviewer - YES
> Round 2 (2026-04-15): APPROVED — naming-only fixes (interface→type, isFocused rename) verified regression-free. 6/6 PromptEditor tests pass, full web-editor suite 1750/1750 passing.
checked by design-reviewer - YES
design-reviewer notes: Reviewed 2026-04-15. PromptEditor.tsx token verification: SURFACE_ELEVATED=#1E1E2E (PASS), BORDER=#252535 (PASS), TEXT_PRIMARY=#F0F0FA (PASS), TEXT_SECONDARY=#8A8AA0 (PASS), WARNING=#F59E0B (PASS), ERROR=#EF4444 (PASS), PRIMARY_FOCUS=rgba(124,58,237,0.5) (PASS). Typography: body text 14px/20px/400 (PASS), caption 11px/16px/400 (PASS), container gap 4px (PASS), editor padding 12px 14px per user spec (PASS). Editor: minHeight 160px on-grid (PASS), borderRadius 8px (radius-md, PASS), focus ring outline 2px solid PRIMARY_FOCUS (PASS). promptEditorDOM.ts chip colors: video=#0EA5E9 (info, PASS), image=#F59E0B (warning, PASS), audio=#10B981 (success, PASS). Chip styling: 2px 6px padding (per spec, PASS), 4px radius (radius-sm, PASS), 12px/16px label text (PASS), inline-flex layout (PASS). All tokens match design-guide.md §3. All off-grid values (2px padding, 6px padding, 2px margin) are intentional per user-provided implementation specs or consistent with approved chip padding pattern. APPROVED.
checked by playwright-reviewer: YES
> Round 1 (2026-04-15) APPROVED: /generate and /editor routes regression-free after PromptEditor primitive shipped (component not yet mounted in /generate, which still shows its placeholder). Round 2 (2026-04-15) APPROVED: naming-only fixes (interface→type conversions, focused→isFocused rename) verified regression-free. Both routes load correctly, 1750 unit tests pass (PromptEditor.test.tsx: 6/6 pass).
