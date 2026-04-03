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
