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
