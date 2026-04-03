# Active Task

## Task
**Name:** EPIC 3 — AI Captions / Auto-Subtitles
**Source:** `docs/general_tasks.md`
**Goal:** Transcribe video/audio assets via Whisper, store segments in a `caption_tracks` DB table, expose a "Add Captions to Timeline" flow in the editor, and allow inline caption text/style editing in an inspector panel.

---

## Context

### Why this task matters
Epic 1 (asset pipeline) and Epic 2 (Remotion Player + playback controls) are fully shipped. Captions are the first AI-powered feature and are positioned as the key differentiator vs. Clipchamp / Clipchamp clones. Auto-subtitles from Whisper are a "Quick Win" on the roadmap because the Whisper API is mature and the Remotion `<TextOverlayLayer>` already exists and renders correctly. Completing this epic closes the loop from "upload video → preview it → add captions → see them in the player".

### Relevant architecture constraints
- All HTTP calls from the frontend must go through `lib/api-client.ts` → feature `api.ts` (never raw `fetch` in components).
- Business logic lives in `caption.service.ts`; SQL lives in `caption.repository.ts`; controllers only parse and delegate.
- The Whisper transcription job handler belongs in `apps/media-worker/src/jobs/transcribe.job.ts` (not a new worker).
- `TranscriptionJobPayload` must be added to `packages/project-schema/src/types/job-payloads.ts` — single source of truth for both enqueue (API side) and consume (worker side).
- Caption clips on the timeline are `TextOverlayClip` — no new clip type needed. The `textOverlayClipSchema` already supports `text`, `startFrame`, `durationFrames`, `fontSize`, `color`, `position`.
- Server state (transcript segments) uses React Query. `ProjectDoc` mutations use Immer via the project store; never put `ProjectDoc` in component state.
- Every new feature module under `apps/web-editor/src/features/captions/` needs an `api.ts` and `types.ts` alongside components and hooks.
- Tests required: unit tests co-located with source (Vitest), and at least a smoke E2E test in `e2e/`.

### Related areas of the codebase
- `apps/api/src/queues/bullmq.ts` — `transcriptionQueue` already declared; used by the new enqueue helper.
- `apps/api/src/queues/jobs/enqueue-ingest.ts` — pattern to follow for `enqueue-transcription.ts`.
- `apps/media-worker/src/index.ts` — must register the new transcription BullMQ Worker alongside the existing ingest worker.
- `apps/media-worker/src/jobs/ingest.job.ts` — pattern for job handler (S3 download → external API → DB update → error path).
- `packages/project-schema/src/types/job-payloads.ts` — add `TranscriptionJobPayload` here.
- `packages/remotion-comps/src/layers/TextOverlayLayer.tsx` — already renders `TextOverlayClip`; caption clips use it directly.
- `apps/web-editor/src/features/asset-manager/` — pattern for feature `api.ts`, `types.ts`, hooks, components.
- `apps/web-editor/src/store/project-store.ts` — mutations go through here using Immer.
- `apps/api/src/db/migrations/001_project_assets_current.sql` — migration style reference.

---

## Subtasks

- [ ] **1. DB Migration — `caption_tracks` table**
  - What: Create `apps/api/src/db/migrations/002_caption_tracks.sql` with the `caption_tracks` table and a migration test.
  - Where: `apps/api/src/db/migrations/`, `apps/api/src/db/migrations/__tests__/migration-002.test.ts`
  - Why: Stores Whisper transcript segments (as JSON) per asset; required by the service layer before any other subtask can be tested end-to-end.
  - Schema: `caption_track_id CHAR(36) PK`, `asset_id CHAR(36) NOT NULL`, `project_id CHAR(36) NOT NULL`, `language VARCHAR(10) NOT NULL DEFAULT 'en'`, `segments_json JSON NOT NULL`, `created_at DATETIME(3)`. Index on `(asset_id, project_id)`. Idempotent (`CREATE TABLE IF NOT EXISTS`).
  - Depends on: none

- [ ] **2. `TranscriptionJobPayload` type**
  - What: Add `TranscriptionJobPayload` to `packages/project-schema/src/types/job-payloads.ts` and re-export it from the package index.
  - Where: `packages/project-schema/src/types/job-payloads.ts`, `packages/project-schema/src/index.ts`
  - Why: Single source of truth for the payload shape used by both the API (enqueue side) and the media-worker (consume side). Must exist before either side is implemented.
  - Shape: `{ assetId: string; storageUri: string; contentType: string; language?: string }`.
  - Depends on: none

- [ ] **3. BE — Transcription enqueue helper + caption repository/service/routes**
  - What: Build the full API slice: `enqueue-transcription.ts` job helper, `caption.repository.ts` (insert/get by assetId), `caption.service.ts` (enqueue + 409 guard), `captions.controller.ts` (thin parse/delegate), `captions.routes.ts` (POST `/assets/:id/transcribe` → 202, GET `/assets/:id/captions`), wired into `apps/api/index.ts`.
  - Where:
    - `apps/api/src/queues/jobs/enqueue-transcription.ts`
    - `apps/api/src/repositories/caption.repository.ts`
    - `apps/api/src/services/caption.service.ts`
    - `apps/api/src/controllers/captions.controller.ts`
    - `apps/api/src/routes/captions.routes.ts`
    - `apps/api/index.ts` (mount `/` captions routes)
  - Why: Exposes the two endpoints the FE polls and triggers. The 409 idempotency guard (don't re-transcribe if already done) is a business rule that lives in `caption.service.ts`.
  - Acceptance: POST returns `{ jobId }` with 202; GET returns `{ segments: [{start, end, text}] }` when ready, 404 when not yet transcribed; POST returns 409 if transcript already exists.
  - Unit tests: `caption.service.test.ts` (enqueue path, 409 path, get path). Integration test: `captions-endpoints.test.ts`.
  - Depends on: Subtask 1 (migration), Subtask 2 (payload type)

- [ ] **4. Media Worker — `transcribe.job.ts`**
  - What: Implement the BullMQ job handler that downloads the asset from S3, sends it to the OpenAI Whisper API (`response_format=verbose_json`), parses `segments[]`, inserts into `caption_tracks`, and handles errors with retry. Wire it into `apps/media-worker/src/index.ts`.
  - Where:
    - `apps/media-worker/src/jobs/transcribe.job.ts`
    - `apps/media-worker/src/index.ts` (add second BullMQ Worker on `QUEUE_TRANSCRIPTION = 'transcription'`)
    - `apps/media-worker/src/config.ts` (add `OPENAI_API_KEY` env var)
  - Why: The actual AI call. Whisper returns word-level timestamps; store the `segments[]` array directly as JSON.
  - Notes: Download the asset to a temp file (or stream to Whisper). Use `openai` npm package. On failure: log error and let BullMQ retry (3x exponential backoff — same as ingest pattern).
  - Unit tests: `transcribe.job.test.ts` (mock openai client + S3 + DB pool).
  - Depends on: Subtask 1, Subtask 2, Subtask 3 (repo for DB insert)

- [ ] **5. FE — Captions feature: types, api.ts, `useTranscriptionStatus` hook**
  - What: Define `CaptionSegment`, `CaptionTrackStatus` types; implement `api.ts` (triggerTranscription, getCaptions); implement `useTranscriptionStatus` hook (React Query poll on `/assets/:id/captions` every 3s while status is not ready).
  - Where:
    - `apps/web-editor/src/features/captions/types.ts`
    - `apps/web-editor/src/features/captions/api.ts`
    - `apps/web-editor/src/features/captions/hooks/useTranscriptionStatus.ts`
  - Why: Foundation that the UI components in subtask 6 consume. Separating types/api/hook from components keeps the feature slice consistent with asset-manager pattern.
  - Unit tests: `useTranscriptionStatus.test.ts`.
  - Depends on: Subtask 3 (endpoints must be specced)

- [ ] **6. FE — "Transcribe" button + "Add Captions to Timeline" action**
  - What: Add a "Transcribe" button to `AssetCard` (visible for video/audio assets). Show transcription status inline (idle / pending / processing / ready / error). When ready, show "Add Captions to Timeline" button — clicking it converts segments into `TextOverlayClip` objects and appends a `captions` track to the project document via the project store.
  - Where:
    - `apps/web-editor/src/features/captions/components/TranscribeButton.tsx`
    - `apps/web-editor/src/features/captions/hooks/useAddCaptionsToTimeline.ts`
    - `apps/web-editor/src/features/asset-manager/components/AssetCard.tsx` (add TranscribeButton)
  - Why: This is the user-facing entry point for the entire captions feature. Segment → clip conversion (frame math: `startFrame = Math.round(segment.start * fps)`, `durationFrames = Math.round((segment.end - segment.start) * fps)`) is UI logic and belongs in `useAddCaptionsToTimeline`.
  - Notes: Clips are created under a new track with `type: 'text-overlay'` and `label: 'Captions'`. The fps comes from `projectStore.getSnapshot().fps`. Use `crypto.randomUUID()` for clip/track IDs.
  - Unit tests: `useAddCaptionsToTimeline.test.ts`.
  - Depends on: Subtask 5

- [ ] **7. FE — Inline Caption Editor Panel**
  - What: Clicking a caption clip on the timeline (clip with `type === 'text-overlay'` on the captions track) opens `CaptionEditorPanel` in the right sidebar. Panel shows: editable text field, start/end frame inputs, font size, color picker, vertical position selector. All edits call `setProject()` via Immer producing patches.
  - Where:
    - `apps/web-editor/src/features/captions/components/CaptionEditorPanel.tsx`
    - `apps/web-editor/src/features/captions/hooks/useCaptionEditor.ts`
    - `apps/web-editor/src/App.tsx` (conditionally render panel when a caption clip is selected)
  - Why: Closes the editing loop — users can fix Whisper errors without leaving the editor.
  - Notes: `selectedClipIds` comes from `ephemeral-store`. The panel only renders when exactly one clip is selected and it is a `text-overlay` clip. No back-end call on each keystroke — changes stay in project store and are saved by the future autosave epic.
  - Unit tests: `CaptionEditorPanel.test.tsx`, `useCaptionEditor.test.ts`.
  - Depends on: Subtask 6

---

## Open Questions / Blockers

- ⚠️ **Whisper API cost / rate limiting**: The epic description calls for a rate-limit and user credit guard on the transcription endpoint. For this implementation, a simple 1-concurrent-transcription-per-asset guard (409 idempotency) is sufficient. A credit system is deferred to a future epic — the implementing agent should NOT build it now.
- ⚠️ **Asset download to Whisper**: Whisper's Node.js SDK accepts a `fs.ReadStream`. The worker should download the asset to a temp file using `s3.GetObjectCommand` + `pipeline()`, then stream it to Whisper, then `fs.unlink()` the temp file on completion or error. The `os.tmpdir()` path is fine.
- ⚠️ **`captions` feature directory**: The `components/` and `hooks/` subdirs already exist (empty stubs). Do not create a new directory — write directly into them.

---

## Notes for the implementing agent

- Follow the `enqueue-ingest.ts` pattern exactly for `enqueue-transcription.ts` — use `assetId` as the BullMQ `jobId` for idempotency.
- The `QUEUE_TRANSCRIPTION = 'transcription'` constant is already exported from `apps/api/src/queues/bullmq.ts` and the queue instance is already created. Import it; do not create a new one.
- In the media-worker, the new transcription BullMQ `Worker` should be created alongside the existing ingest worker in `index.ts`. Both run in the same process; concurrency for transcription should be `1` (Whisper calls are slow and expensive).
- The `caption.repository.ts` insert function should accept `{ captionTrackId, assetId, projectId, language, segmentsJson }` and use `INSERT IGNORE` (or check for existence first) to remain idempotent.
- `GET /assets/:id/captions` returns `404` if no transcript exists yet (do not return empty array — the FE uses 404 to distinguish "not transcribed" from "transcribed but empty").
- In `useTranscriptionStatus`, the React Query hook should stop polling (set `refetchInterval: false`) once the status is `ready` or `error`.
- Frame math for segment→clip conversion: `startFrame = Math.round(segment.start * fps)`, `durationFrames = Math.max(1, Math.round((segment.end - segment.start) * fps))`.
- `CaptionEditorPanel` must not render if `selectedClipIds.length !== 1` or if the selected clip is not a `text-overlay` type — guard this in `App.tsx` before passing the clip down.
- Do not build a visual timeline track row in this epic — that is part of the Timeline Editor epic. The caption clips only need to exist in the project doc and render in the Remotion Player via the existing `TextOverlayLayer`.

---
_Generated by task-planner skill — 2026-04-03_

---
**Status: Ready For Use By task-executor**
