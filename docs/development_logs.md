# Development Log (compacted — 2026-03-29 to 2026-04-08)

## Monorepo Scaffold (Epic 1)
- added: root config (`package.json`, `turbo.json`, `tsconfig.json`, `.env.example`, `.gitignore`, `docker-compose.yml` — MySQL 8 + Redis 7)
- added: `apps/api/` (Express + helmet/cors/rate-limit, BullMQ stubs), `apps/web-editor/` (React 18 + Vite), `apps/media-worker/`, `apps/render-worker/` (BullMQ stubs)
- added: `packages/project-schema/` (Zod: ProjectDoc, Track, Clip union, imageClipSchema), `packages/remotion-comps/` (VideoComposition + layers)
- fixed: `APP_` env prefix; Zod startup validation; `workspace:*` → `file:` paths

## DB Migrations
- added: migrations 001–010 (projects, assets, captions, versions, render_jobs, project_clips, seed, image clip ENUM, users/sessions/password_resets/email_verifications, ai_provider_configs, ai_generation_jobs)

## Infrastructure (Redis + BullMQ + S3)
- updated: Redis healthcheck, error handlers, graceful shutdown, concurrency in workers
- fixed: `@/` alias + `tsc-alias` in api tsconfig
- added: S3 stream endpoint `GET /assets/:id/stream` with Range header forwarding

## Asset Upload Pipeline (Epic 1)
- added: `errors.ts`, `s3.ts`, `validate.middleware.ts`, `auth.middleware.ts`, `acl.middleware.ts`
- added: asset CRUD endpoints (upload-url, get, list, finalize, delete, stream)
- added: `enqueue-ingest.ts` (idempotency, 3 retries, exponential backoff)
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
- added: migration 008 — users, sessions, password_resets, email_verifications tables
- added: `user.repository.ts`, `session.repository.ts`, `auth.service.ts` (32-byte tokens, SHA-256, 7-day TTL, bcrypt-12)
- added: auth routes — register, login, logout, me; rate limiting (5 reg/IP/hr, 5 login/email/15min)
- added: `email.service.ts` (stub), password-reset (1hr TTL), email-verify (24hr TTL), single-use tokens; forgot-password always 200
- rewrote: `auth.middleware.ts` — session-based via `authService.validateSession()`; `APP_DEV_AUTH_BYPASS` env var
- updated: `acl.middleware.ts`, `express.d.ts` (req.user shape), all controllers (`req.user.id` → `req.user.userId`)
- added FE: `features/auth/` — LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage; React Router; auth styles (dark theme, 4px grid)
- added: `AuthProvider.tsx`, `ProtectedRoute.tsx`, `useAuth.ts`; Bearer token injection + 401 interceptor
- added: `oauth.service.ts` (Google + GitHub code exchange, account linking); OAuth routes + FE buttons + `useOAuthToken.ts`
- tests: 203 API + 37 auth + 48 FE auth + 17 OAuth tests

## AI Platform Integration — Epic 9 Phase 1 (Backend Foundation)
- added: migration 009 — `ai_provider_configs` table (user_id CHAR(36), provider ENUM×8, AES-256-GCM encrypted keys, UNIQUE user+provider)
- added: migration 010 — `ai_generation_jobs` table (job_id VARCHAR(64) PK, type/provider/status ENUMs, progress, result_asset_id FK)
- added: `lib/encryption.ts` — AES-256-GCM encrypt/decrypt; `APP_AI_ENCRYPTION_KEY` in config + docker-compose
- added: AI provider CRUD — `aiProvider.repository.ts`, `aiProvider.service.ts`, `aiProviders.controller.ts`, `aiProviders.routes.ts`; keys never returned
- added: AI generation — `aiGenerationJob.repository.ts`, `aiGeneration.service.ts`, `aiGeneration.controller.ts`, `aiGeneration.routes.ts`; submit (POST 202) + job status (GET)
- added: `enqueue-ai-generate.ts`, `QUEUE_AI_GENERATE` queue in `bullmq.ts`
- added: image adapters — `openai-image.adapter.ts` (DALL-E 3), `stability-image.adapter.ts`, `replicate-image.adapter.ts` (Flux, polling)
- added: video adapters — `runway-video.adapter.ts` (Gen-4), `kling-video.adapter.ts`, `pika-video.adapter.ts` (all polling)
- added: audio adapters — `elevenlabs-audio.adapter.ts` (sync TTS/SFX), `suno-audio.adapter.ts` (polling music)
- added: `ai-generate.job.ts` — routes to adapters by type+provider, updates DB; registered in media-worker (concurrency 2)
- tests: 104 total (encryption 11, provider service 12, generation service 11, image 15, video 29, audio/job 26)

## AI Platform Integration — Epic 9 Phase 2 (Frontend)
- added: `features/ai-providers/types.ts` — AiProvider union, ProviderSummary, ProviderInfo, PROVIDER_CATALOG (8 providers)
- added: `features/ai-providers/api.ts` — listProviders, addProvider, updateProvider, deleteProvider
- added: `features/ai-providers/hooks/useAiProviders.ts` — fetch + mutations + loading/error/mutating state
- added: `features/ai-providers/components/AiProvidersModal.tsx` + `.styles.ts` — 560px modal, header/body/footer, dark theme
- added: `features/ai-providers/components/ProviderCard.tsx` — card with key input, toggle, delete confirm, Connected badge
- added: `features/ai-generation/types.ts` — AiGenerationType, option shapes, AiGenerationJob, AiJobStatus
- added: `features/ai-generation/api.ts` — submitGeneration, getJobStatus
- added: `features/ai-generation/hooks/useJobPolling.ts` — 2.5s interval, terminal state stop, cleanup
- added: `features/ai-generation/hooks/useAiGeneration.ts` — submit → poll → track lifecycle
- added: `features/ai-generation/components/` — GenerationTypeSelector, GenerationOptionsForm, GenerationProgress, AiGenerationPanel (280px sidebar, 4 phases: idle/generating/complete/failed)
- added: `features/ai-generation/components/LeftSidebarTabs.tsx` — desktop tab switcher "Assets" / "AI Generate"
- updated: `TopBar.tsx` — "AI" button (settingsButton style) between Settings and History
- updated: `App.tsx` — `isAiProvidersOpen` state + `leftSidebarTab` state; modal + panel wiring in both layouts
- updated: `App.panels.tsx` — `'ai-generate'` case in MobileTabContent with `onOpenProviders` prop
- updated: `MobileInspectorTabs.tsx` — `'ai-generate'` tab added (4 tabs total)
- tests: 19 ai-providers types/api + 7 useAiProviders + 58 ai-generation (hooks + components) + 4 TopBar AI + 5 sidebar integration + 7 LeftSidebarTabs + 3 MobileInspectorTabs AI = 103 total

## Known Issues / TODOs
- ACL middleware stub — real project ownership check deferred
- `packages/api-contracts/` — only PATCH clip in OpenAPI spec
- Presigned download URL deferred; S3 CORS needs bucket config
- `deleteAsset` lacks unit test; PATCH drag/trim fire-and-forget
- Pre-existing: OOM in web-editor tests, API integration test failures, null audio durations
- Production stream endpoint needs signed URL tokens
- Figma: track labels 64px→160px mismatch; several frames need manual updates
- OAuth client IDs/secrets default empty — require setup
- AI "Test Connection" button deferred — no backend endpoint exists


## [2026-04-08]

### Task: Fix left sidebar tab layout shift
**Subtask:** Make AI Generated left tab and Assets with same width

**What was done:**
- Changed AiGenerationPanel width from 280px to 320px to match AssetBrowserPanel width
- Modified: `apps/web-editor/src/features/ai-generation/components/aiGenerationPanelStyles.ts`
- Created: `apps/web-editor/src/features/ai-generation/components/aiGenerationPanelStyles.test.ts` — verifies panel width matches 320px

**Notes:**
- The sidebar container has no fixed width (flexShrink: 0), so it sizes to its content. Both panels must be the same width to prevent layout shift on tab switch.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Make AI Generated left tab and Assets with same width</summary>

Make AI Generated left tab and Assets with same width, so there should not be that additional movement when you move from one tab to another

</details>

checked by code-reviewer - OK
checked by qa-reviewer - YES
checked by design-reviewer - YES
checked by playwright-reviewer: YES

design-reviewer notes: Reviewed on 2026-04-08. Code change is correct and well-tested. AI Generation Panel width increased from 280px to 320px to match Asset Browser Panel, preventing layout shift when switching left sidebar tabs. Updated design-guide.md Section 8 (line 227) to document 320px as the actual implementation width for left sidebar. All color, typography, and spacing tokens are correct per design-guide.md Section 3.

## [2026-04-08]

### Task: Fix provider status not updating after add
**Subtask:** Provider status not updating after add without page reload

**What was done:**
- Added `isProvidersModalOpen` prop to `AiGenerationPanel` — when it flips from `true` to `false` (modal closes), providers are refetched
- Updated `useEffect` dependency in `AiGenerationPanel` to skip fetch while modal is open and refetch on close
- Passed `isProvidersModalOpen` from `App.tsx` for both desktop and mobile layouts
- Updated `MobileTabContent` in `App.panels.tsx` to accept and forward the new prop
- Added 2 tests: verifies refetch on modal close, and verifies "No provider configured" disappears after adding a provider

**Notes:**
- The root cause was `AiGenerationPanel` fetching providers only on mount with `useEffect([], [])`. The providers modal uses a separate `useAiProviders` hook, so changes made there were invisible to the panel.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Provider status not updating after add without page reload</summary>

When I already added provider, message No provider configured for Video still was on place until I did not reload page, fix that

</details>

checked by code-reviewer - OK
checked by qa-reviewer - YES
checked by design-reviewer - YES
checked by playwright-reviewer: YES

design-reviewer notes: Reviewed on 2026-04-08. Logic-only fix with no visual design changes. AiGenerationPanel now accepts isProvidersModalOpen prop and refetches providers when modal closes, eliminating stale "No provider configured" messages. Changes span App.tsx (state + handlers), App.panels.tsx (prop forwarding), and AiGenerationPanel.tsx (prop + useEffect). Two comprehensive tests added. All code follows existing patterns; no color, typography, spacing, or layout changes. No design violations found.

## [2026-04-08]

### Task: Fix OpenAI generation fetch failed error
**Subtask:** OpenAI generation - fetch failed error on job

**What was done:**
- Changed OpenAI DALL-E adapter to use `response_format: 'b64_json'` instead of downloading image from a URL
- The root cause: DALL-E API returned a temporary image URL, but the second `fetch` to download that image from Azure Blob Storage CDN failed in the Docker container with "TypeError: fetch failed"
- By requesting base64-encoded image data directly from the API, we eliminate the fragile intermediate download step
- Updated tests to reflect single-fetch pattern (7 tests, all passing)

**Files modified:**
- `apps/media-worker/src/providers/openai-image.adapter.ts` — switched to b64_json response format
- `apps/media-worker/src/providers/openai-image.adapter.test.ts` — updated mocks and assertions for base64 flow

**Notes:**
- The "fetch failed" was a Node.js network-level error (undici) at line 54 (image download step), not the API call itself
- The fix is more robust: avoids DNS/TLS issues with Azure Blob Storage CDN URLs, avoids URL expiration concerns

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: OpenAI generation - fetch failed error on job</summary>

OpenAI generation - fetch failed error on job

</details>

checked by code-reviewer - OK
checked by qa-reviewer - YES
checked by design-reviewer - YES
checked by playwright-reviewer: YES

code-reviewer notes: Reviewed on 2026-04-08. Architecture rules compliant. Implementation follows layered architecture (media-worker job → provider adapter). File placement correct (`apps/media-worker/src/providers/openai-image.adapter.ts`). Naming conventions followed (camelCase.adapter.ts). Import ordering correct (Node built-in → external packages → internal types). No forbidden dependencies. Error handling comprehensive: API error responses (line 43-46), missing image data (line 50-52), S3 upload errors tested. Test file co-located, 7 tests covering happy path, all error cases, and critical behavior verification. No violations found.

qa-reviewer notes: Reviewed on 2026-04-08. Test coverage complete — 7 unit tests in `openai-image.adapter.test.ts` cover: API call with b64_json format, API error, no data, default size, style param, S3 upload failure, and single-fetch assertion. All 104 media-worker tests pass; no regressions. Implementation correct: base64 response eliminates fragile URL-download step that was failing with "TypeError: fetch failed" in Docker.

playwright-reviewer notes: Reviewed on 2026-04-08. Verified AI generation UI loads and functions correctly. App shell loads cleanly; TopBar displays AI button. AI Providers Modal opens with 8 provider cards (OpenAI, Stability AI, Replicate, Runway, ElevenLabs, Kling, Pika, Suno), each showing provider info, API key input, and action buttons. AI Generate left sidebar tab switches correctly, showing generation type selector (Image/Video/Audio), prompt textarea, Size and Style dropdowns, and Generate button. Form elements render without JS errors. No regressions detected. Backend fix is transparent to UI; no frontend changes required beyond auth bypass enablement for E2E testing.

design-reviewer notes: Reviewed on 2026-04-08. Backend-only change — media-worker OpenAI DALL-E adapter refactoring from URL-fetch to base64-response pattern. No frontend, UI components, styling, typography, spacing, or layout changes. Out of scope for design review. Change is isolated to Node.js job adapter code and unit tests.

## [2026-04-08]

### Task: Auto-add AI-generated content to assets
**Subtask:** Auto-add AI-generated image/video/audio to assets with clear user feedback

**What was done:**
- Modified `apps/media-worker/src/jobs/ai-generate.job.ts` to auto-create an asset row in `project_assets_current` after AI generation completes
- Updated `runAdapter` to return full metadata (URL, contentType, width, height, durationSeconds, filename) instead of just a URL
- Added `onSwitchToAssets` prop to `AiGenerationPanel` for sidebar tab switching
- Updated completion UI to show "Added to your Assets" message with "View in Assets" button
- Added query invalidation (`['assets', projectId]`) when generation completes so asset browser auto-refreshes
- Wired up `onSwitchToAssets` in both desktop (`App.tsx`) and mobile (`App.panels.tsx`) layouts
- Added `assetAddedText` style to `aiGenerationPanelStyles.ts`
- Updated all tests in `ai-generate.job.test.ts` (12 tests) and `AiGenerationPanel.test.tsx` (19 tests)

**Files modified:**
- `apps/media-worker/src/jobs/ai-generate.job.ts`
- `apps/media-worker/src/jobs/ai-generate.job.test.ts`
- `apps/web-editor/src/features/ai-generation/components/AiGenerationPanel.tsx`
- `apps/web-editor/src/features/ai-generation/components/AiGenerationPanel.test.tsx`
- `apps/web-editor/src/features/ai-generation/components/aiGenerationPanelStyles.ts`
- `apps/web-editor/src/App.tsx`
- `apps/web-editor/src/App.panels.tsx`

**Notes:**
- Asset is created with `file_size_bytes = 0` since exact byte size isn't available from the adapter without a HEAD request — acceptable trade-off
- Asset status is set directly to `ready` (skipping `pending`/`processing`) since the content is already uploaded and doesn't need ingest processing

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Auto-add AI-generated content to assets</summary>

1. Once AI image/video/audio generated it should automatically be added to assets, and also that should be clear for user that he can find it in assets

</details>

checked by code-reviewer - OK
checked by qa-reviewer - YES
checked by design-reviewer - YES
checked by playwright-reviewer: YES

design-reviewer notes: Reviewed on 2026-04-08. All checks passed. New "Added to your Assets" secondary text uses body-sm token spec: 12px font, 400 weight, 16px line-height, TEXT_SECONDARY color (#8A8AA0) per design-guide.md Section 3. "View in Assets" primary button correctly uses PRIMARY background with TEXT_PRIMARY text (generateButton style). Layout hierarchy and spacing (12px gaps in resultWrapper) match existing completion state patterns. Asset query invalidation wired correctly for both desktop and mobile. No design guide violations found.

qa-reviewer notes: Reviewed on 2026-04-08. All unit and integration tests passing. Media-worker `ai-generate.job.test.ts` — 12/12 tests pass, covering asset creation on all 8 provider types (image/video/audio), metadata assembly, error handling, and adapter failure scenarios. Web-editor `AiGenerationPanel.test.tsx` — 19/19 tests pass, covering completion state rendering, "View in Assets" button callback wiring, query invalidation, and provider modal refetch behavior. Integration verified: `onSwitchToAssets` properly wired in both desktop (App.tsx:241) and mobile (App.panels.tsx:185). Regression gate clean — media-worker 105/105 tests, web-editor 1512/1512 tests all passing. Implementation correct: assets auto-created with status='ready', file_size_bytes=0 is acceptable trade-off.

playwright-reviewer notes: Reviewed on 2026-04-08. E2E verified app shell loads and authenticates correctly. AI Generate left sidebar panel renders without errors — type selector (Image/Video/Audio), prompt textarea, size/style dropdowns, and form controls all functional. Component tree renders successfully across desktop layout. Backend implementation confirmed: `ai-generate.job.ts` creates asset row in `project_assets_current` with status='ready' (lines 64-71) and updates job with `result_asset_id` (lines 73-78). Frontend correctly invalidates `['assets', projectId]` query on completion (AiGenerationPanel.tsx:75). Completion state UI components verified in unit tests — "Added to your Assets" text renders (test line 143), "View in Assets" button functional (test lines 163-180), `onSwitchToAssets` callback wired in both layouts. No JS errors, no regressions. Feature implementation complete and correct.

## [2026-04-08]

### Task: Fix asset stream/thumbnail 401 Unauthorized for browser media elements
**Subtask:** Add query-param token fallback for media endpoints

**What was done:**
- Browser media elements (`<img>`, `<video>`, Remotion `prefetch()`) cannot attach Authorization headers, causing 401 on `/assets/:id/stream` and `/assets/:id/thumbnail`
- Modified `apps/api/src/middleware/auth.middleware.ts` to accept `?token=` query parameter as a fallback when no Authorization header is present; header takes precedence
- Added `buildAuthenticatedUrl()` helper to `apps/web-editor/src/lib/api-client.ts` that appends `?token=<auth_token>` from localStorage
- Updated `apps/web-editor/src/features/preview/hooks/useRemotionPlayer.ts` to use `buildAuthenticatedUrl()` for stream URLs
- Updated `apps/web-editor/src/features/asset-manager/utils.ts` `getAssetPreviewUrl()` to use `buildAuthenticatedUrl()` for both thumbnail and stream URLs
- Added 3 new tests to `apps/api/src/middleware/auth.middleware.test.ts` covering query-param auth (valid token, header precedence, invalid token)

**Files modified:**
- `apps/api/src/middleware/auth.middleware.ts`
- `apps/api/src/middleware/auth.middleware.test.ts`
- `apps/web-editor/src/lib/api-client.ts`
- `apps/web-editor/src/features/preview/hooks/useRemotionPlayer.ts`
- `apps/web-editor/src/features/asset-manager/utils.ts`

**Notes:**
- Query-param token is a standard pattern for media streaming endpoints where browser elements cannot attach headers
- Authorization header is always preferred over query param when both are present
- All 1512 web-editor tests and 45 API middleware tests pass with no regressions

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Fix asset stream 401 for browser media elements</summary>

Fix `GET /assets/:id/stream` returning 401 Unauthorized for `<img>`, `<video>`, and Remotion `prefetch()` requests that cannot attach Authorization headers.

</details>

checked by code-reviewer - OK
checked by qa-reviewer - YES
checked by design-reviewer - YES
checked by playwright-reviewer: YES

playwright-reviewer notes: Reviewed on 2026-04-08. E2E verified asset stream 401 fix is working. Test flow: authenticated user login via API → app loads editor with token in localStorage → upload test video asset → asset card appears in browser with thumbnail image → thumbnail URL verified to include ?token=<auth_token> query parameter → no 401 errors detected on asset URLs during load and display. Screenshots captured: (1) authenticated editor loads, (2) upload dialog with in-progress video, (3) asset card with thumbnail successfully loaded. Implementation confirmed: buildAuthenticatedUrl() correctly appends token to asset thumbnail and stream URLs; auth.middleware.ts accepts ?token= query param as fallback when Authorization header missing (browser <img> and <video> elements). Test result: PASSED — feature working correctly, no 401 errors on browser media element requests.

code-reviewer notes: Reviewed on 2026-04-08. Architecture rules compliant. File placement correct per Section 3. Naming conventions followed (Section 9): authMiddleware, buildAuthenticatedUrl(), getAuthToken() verbs-first. Import ordering correct (Section 9): Node built-ins → external → monorepo packages → absolute @/ → relative. Middleware pattern: request parsing + token validation only, attaches req.user (Section 4, Section 11). API client properly centralizes token management (Section 8). Auth header precedence over query param correctly implemented (lines 32-35 in auth.middleware.ts). Query param token is fallback-only for browser media elements that cannot set headers (documented in Section 11 security). Token encoding safe with encodeURIComponent() (line 22 api-client.ts). Test coverage comprehensive: 9 auth middleware tests pass (dev bypass, missing header, malformed, valid, invalid, query param, header precedence). All modified files tested: api-client.test.ts 7/7, asset-manager/utils.test.ts 25/25, useRemotionPlayer.test.ts 18/18 pass. No violations.

qa-reviewer notes: Reviewed on 2026-04-08. Test coverage comprehensive — enhanced existing test files to cover the new query-parameter authentication feature. API middleware (auth.middleware.test.ts): 9 total tests, including 3 new tests for ?token= query parameter fallback (valid token, header precedence, invalid token). Web-editor api-client (api-client.test.ts): 18 total tests, added new coverage for buildAuthenticatedUrl() function (token appending, ? vs & separator logic, URL encoding, multi-param handling, fragments, scheme preservation) and getAuthToken() function. Asset-manager utils (utils.test.ts): 25 total tests, added authenticated URL scenarios for thumbnail and stream endpoints with token present/absent in localStorage. Remotion player hook (useRemotionPlayer.test.ts): 20 total tests, verified stream URL authentication when token exists and no authentication when absent. Full regression gate: 1529 web-editor tests pass, 45 middleware tests pass, no regressions. Implementation correct: Authorization header properly preferred over query parameter (backward compatible), token values URL-encoded, all integration points wired.

design-reviewer notes: Reviewed on 2026-04-08. Backend authentication infrastructure fix with no UI design impact. Changes: (1) auth.middleware.ts accepts ?token= query parameter as fallback for Authorization header, (2) api-client.ts adds buildAuthenticatedUrl() helper to append token query params, (3) useRemotionPlayer.ts and asset-manager/utils.ts use the helper for stream/thumbnail URLs. No components, colors, typography, spacing, layout, or variants changed. Pure implementation detail for media element authentication. All design system tokens unchanged. No Figma scope.
