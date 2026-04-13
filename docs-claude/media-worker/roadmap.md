## apps/media-worker — Domain Roadmap
> Part of: [← Project Roadmap](../roadmap.md)
> Generated: 2026-04-13 | 26 files

---

## Responsibility
BullMQ consumer that handles all heavy media work triggered by the API: FFprobe/FFmpeg ingest (metadata, thumbnails, waveforms), OpenAI Whisper transcription, and AI generation via fal.ai (image/video) + ElevenLabs (audio / voice cloning). Writes results to S3 and updates MySQL rows so the frontend's polling hooks pick them up.

---

## Structure

```
apps/media-worker/src/
  index.ts         ← Bootstraps 3 BullMQ Workers + graceful shutdown
  config.ts        ← Zod-validated env (ONLY process.env reader in this app)
  jobs/
    ingest.job.ts                      ← media-ingest queue handler
    transcribe.job.ts                  ← transcription queue handler
    ai-generate.job.ts                 ← ai-generate queue dispatcher (fal branch + audio delegate)
    ai-generate.output.ts              ← Capability-aware fal output parser + AiCapability / FalCapability / AudioCapability types
    ai-generate-audio.handler.ts       ← ElevenLabs branch: TTS / voice-clone / S2S / music
  lib/
    db.ts                              ← mysql2 pool (5 connections)
    s3.ts                              ← S3Client singleton
    storage-uri.ts                     ← `s3://bucket/key` parser
    fal-client.ts                      ← fal.ai HTTP queue API wrapper
    elevenlabs-client.ts               ← ElevenLabs HTTP API wrapper (TTS / clone / S2S / music)
```

Co-located `*.test.ts` / `*.fixtures.ts` per job + client (Vitest).

---

## Bootstrap (`src/index.ts`)

Creates three `Worker` instances + one `Queue` producer (needed to re-enqueue into `media-ingest` from the AI pipeline):

| Worker | Queue | Concurrency | Purpose |
|---|---|---|---|
| `ingestWorker` | `media-ingest` | 2 | FFprobe + thumbnail + waveform |
| `transcriptionWorker` | `transcription` | **1** (Whisper calls are slow/expensive) | Whisper-1 |
| `aiGenerateWorker` | `ai-generate` | 2 | fal.ai + ElevenLabs dispatcher |

Also holds one producer `mediaIngestQueue` — used by the **ai-generate** worker to hand off newly uploaded generated assets (image/video/audio) back into the ingest pipeline so they get duration/fps/thumbnail just like user uploads.

**Graceful shutdown:** `SIGTERM`/`SIGINT` → `Promise.all([ingestWorker.close(), transcriptionWorker.close(), aiGenerateWorker.close(), mediaIngestQueue.close()])` → exit.

**Dependency injection pattern:** Every job handler receives its deps explicitly (e.g. `{ s3, pool, openai, fal, elevenlabs, bucket, falKey, elevenlabsKey, ingestQueue }`) so handlers never import `@/config` or touch `process.env`. This keeps them pure-ish and trivially unit-testable with fakes.

---

## Job: Ingest (`jobs/ingest.job.ts`)

**Input:** `MediaIngestJobPayload` from `@ai-video-editor/project-schema` — contains `assetId` and an `s3://` storage URI.

**Flow:**
```
1. Download S3 object to a temp file in /tmp
2. ffprobe → width, height, durationSeconds, fps (parsed from r_frame_rate "30000/1001"),
   audio codec info
3. For video: extract a thumbnail frame at t=1s → upload to S3 under thumbnails/
4. For video/audio: decode 200 signed 16-bit LE PCM samples, compute RMS peaks,
   store as waveform JSON
5. UPDATE project_assets_current SET width/height/duration_frames/fps/waveform_json/
   thumbnail_url/status='ready' WHERE asset_id = ?
6. Clean up temp files
```

**Constants:**
- `WAVEFORM_PEAKS = 200` — number of amplitude peaks returned for audio/video.
- `AUDIO_FPS_FALLBACK = 30` — used to convert `durationSeconds → durationFrames` for audio-only assets (which have no real fps). Reconstructed on the FE as `durationFrames / fps`.

**Key pure functions (exported for tests):**
- `parseStorageUri('s3://bucket/key')` — re-exports from `lib/storage-uri.ts`.
- `parseFps('30000/1001')` — returns decimal fps or `null`.
- `computeRmsPeaks(pcmBuffer, numPeaks)` — downsamples s16le PCM into normalised [0..1] RMS values.

**External:** `fluent-ffmpeg` — requires `ffmpeg` + `ffprobe` on PATH inside the container.

---

## Job: Transcribe (`jobs/transcribe.job.ts`)

**Input:** `TranscriptionJobPayload` — `{ assetId }`.

**Flow:**
```
1. SELECT project_id FROM project_assets_current WHERE asset_id = ?
2. Download audio from S3 to /tmp
3. openai.audio.transcriptions.create({ model: 'whisper-1', file: createReadStream(tmpPath), response_format: 'verbose_json' })
4. Map response segments → CaptionSegment[] (from project-schema)
5. INSERT IGNORE INTO caption_tracks (caption_track_id, asset_id, project_id, language, segments_json)
6. Clean up temp files
```

**Constants:** `WHISPER_MODEL = 'whisper-1'`.

**Concurrency: 1** (worker-level) — Whisper is slow and has per-account rate limits.

**Idempotency:** `INSERT IGNORE` on `caption_tracks` so re-runs are safe; the API's `POST /assets/:id/transcribe` returns 409 if a track already exists, but the worker still defends against races.

---

## Job: AI Generate (`jobs/ai-generate.job.ts`)

Unified dispatcher for the `ai-generate` queue. Branches on `provider` (`fal` | `elevenlabs`) derived from the job payload. The **same queue** serves both providers — see `project_phase2_decisions` memory.

### Payload shape
```ts
type AiGenerateJobPayload = {
  jobId: string;            // FK to ai_generation_jobs
  userId: string;
  projectId: string;
  modelId: string;          // e.g. 'fal-ai/nano-banana-2' or 'elevenlabs/tts'
  capability: AiCapability; // union: FalCapability | AudioCapability
  provider: 'fal' | 'elevenlabs';
  prompt: string;
  options: Record<string, unknown>;
};
```

### Injected deps
```ts
type AiGenerateJobDeps = {
  s3: S3Client;
  pool: Pool;
  bucket: string;
  falKey: string;
  fal: { submitFalJob, getFalJobStatus };
  elevenlabsKey: string;
  elevenlabs: ElevenLabsClientFns;  // textToSpeech, voiceClone, speechToSpeech, musicGeneration
  ingestQueue: Queue<MediaIngestJobPayload>;  // for re-enqueuing the generated asset
};
```

### fal.ai flow (image / video)
```
1. Mark ai_generation_jobs.status = 'processing', progress = 0
2. fal.submitFalJob({ modelId, input, apiKey })        → request_id
3. UPDATE progress = 50 (PROGRESS_SUBMITTED)
4. Poll fal.getFalJobStatus every 3s (POLL_INTERVAL_MS):
     - IN_QUEUE / IN_PROGRESS → progress += 5 (capped at 95, PROGRESS_POLL_CEILING)
     - COMPLETED              → break, fetch result payload
     - FAILED / non-2xx       → throw (defensive)
   Give up after 10 minutes (POLL_TIMEOUT_MS) and fail the job
5. parseFalOutput(capability, output)  // ai-generate.output.ts
     → { remoteUrl, extension, contentType, width, height, durationSeconds }
6. fetch(remoteUrl) → download to buffer
7. Upload to S3: ai-generated/{jobId}.{extension}
8. Insert a new project_assets_current row (status='pending') for the generated file
9. Enqueue a media-ingest job → FFprobe/thumbnail/waveform runs
10. UPDATE ai_generation_jobs.status='done', result_url, progress=100, result_asset_id
```

**Capability → output shape** (`jobs/ai-generate.output.ts`):
- `text_to_image`, `image_edit` → `{ images: [{ url, width, height }] }` (primary) or `{ image: { ... } }` (legacy)
- `text_to_video`, `image_to_video` → `{ video: { url, width?, height?, duration? } }`
- **Branching rule:** switch on `capability`, NEVER on `modelId` — so any new model inside an existing capability works automatically.
- Default extensions: `png` for image, `mp4` for video; known set: `png/jpg/jpeg/webp`, `mp4/webm`.

**Why split from ElevenLabs:** fal outputs always resolve to a remote HTTPS URL that needs to be fetched + re-uploaded. ElevenLabs audio APIs return bytes directly — different flow.

### ElevenLabs flow (`jobs/ai-generate-audio.handler.ts`)

Dispatched via `processElevenLabsCapability(data, deps)` when `provider === 'elevenlabs'`. Switches on `capability`:

| Capability | ElevenLabs API | Output | Side effects |
|---|---|---|---|
| `text_to_speech` | `POST /v1/text-to-speech/{voiceId}` | `Buffer` (mp3) | Upload to S3 → insert asset → enqueue ingest |
| `speech_to_speech` | `POST /v1/speech-to-speech/{voiceId}` (multipart, `audio_upload` field) | `Buffer` (mp3) | Same as TTS |
| `music_generation` | `POST /v1/sound-generation` | `Buffer` (mp3) | Same as TTS |
| `voice_cloning` | `POST /v1/voices/add` (multipart) | `{ voice_id }` | **No audio asset.** Insert into `user_voices` (migration 016) for reuse; store `elevenlabs://voice/{voiceId}` in `ai_generation_jobs.result_url` |

**Shape of the audio handler:** intentionally **BullMQ-free** — accepts pre-destructured `AudioJobData` + `AudioHandlerDeps` so it can be unit tested without the full `Job` wrapper. Matches the "deps as typed params" pattern in the rest of the worker.

**Output format:** `mp3_44100_128` (constant in `elevenlabs-client.ts`). Default model `eleven_multilingual_v2`, default voice `pNInz6obpgDQGcFmaJgB` ("Adam").

**Voice library (`user_voices`):** Populated on every successful `voice_cloning` call. Read by the API's `GET /ai/voices` endpoint and displayed in the web-editor `VoicePickerModal`. Separate from `GET /ai/voices/available` which is the global ElevenLabs library (Redis-cached by the API).

---

## Libraries (`src/lib/`)

### `fal-client.ts`
Thin `fetch` wrapper around the **fal.ai Queue API**:

| Function | Verb | URL |
|---|---|---|
| `submitFalJob({ modelId, input, apiKey })` | POST | `https://queue.fal.run/{modelId}` → `{ request_id, status_url, response_url, queue_position }` |
| `getFalJobStatus({ modelId, requestId, apiKey })` | GET | `https://queue.fal.run/{modelId}/requests/{requestId}/status` → `{ status }` |
| *(implicit, via status)* | GET | `https://queue.fal.run/{modelId}/requests/{requestId}` → model-specific result JSON |

**Auth header:** `Authorization: Key <apiKey>`.

**Status enum:** `IN_QUEUE | IN_PROGRESS | COMPLETED`. `FAILED` is kept as a defensive branch but is officially undocumented — fal surfaces terminal failures as non-2xx HTTP responses.

**No side effects on import** — `apiKey` is always passed as a parameter, never read from `config`/`process.env`. Unit tests stub global `fetch`.

### `elevenlabs-client.ts`
Thin `fetch` wrapper exposing `textToSpeech`, `voiceClone`, `speechToSpeech`, `musicGeneration`. Same "no side effects on import, api key as param" pattern. Throws `ElevenLabsError` on non-2xx. Returns `Buffer` (audio bytes) or `{ voice_id }` for clone.

### `db.ts`
mysql2 connection pool, singleton, `connectionLimit: 5` (lower than the API's 10 — workers hold connections for longer during Whisper/fal polling, and the concurrent worker count is small).

### `s3.ts`
AWS SDK v3 `S3Client` singleton with config from `config.s3`.

### `storage-uri.ts`
`parseStorageUri('s3://bucket/key')` — one function. Used by every job handler.

---

## Testing

Every job and lib client has an extensive co-located test suite:

- `ingest.job.test.ts` — ffprobe parsing, waveform math, full job flow with stubbed S3/pool/ffmpeg
- `transcribe.job.test.ts` — Whisper response mapping, caption_tracks insert
- `ai-generate.job.test.ts` + `.fixtures.ts` + `.errors.test.ts` — submit/poll/parse, timeout handling, failure path, progress updates
- `ai-generate-audio.handler.test.ts` + `.fixtures.ts` + `.errors.test.ts` + `.voices.test.ts` — per-capability branches, user_voices insert, error propagation
- `ai-generate.output.ts` — parser unit tests (capability branching, primary/fallback shapes)
- `fal-client.test.ts` — fetch stub, header construction, status parsing
- `elevenlabs-client.test.ts` + `.errors.test.ts` + `.fixtures.ts` + `.voices.test.ts` — per-endpoint request shape, error propagation, voice operations

**Never mock the database in integration tests** — all handler tests that touch the DB use a real MySQL (docker-compose). See `feedback_integration_tests` memory.

**Run:** `npm --workspace @cliptale/media-worker run test`.

---

## External Dependencies

| Package | Purpose |
|---|---|
| `bullmq`, `ioredis` | Queue consumer |
| `@aws-sdk/client-s3` | Download/upload to S3 |
| `mysql2` | Update rows in `project_assets_current`, `caption_tracks`, `ai_generation_jobs`, `user_voices` |
| `openai` | Whisper transcription |
| `fluent-ffmpeg` | FFprobe + thumbnail extraction + PCM decode (requires `ffmpeg` + `ffprobe` binaries in the container) |
| `zod` | Env validation |
| `@ai-video-editor/project-schema` | Shared `MediaIngestJobPayload`, `TranscriptionJobPayload`, `CaptionSegment` types |

No `@ai-video-editor/api-contracts` import — model metadata is authoritative on the API side; the worker only needs the `capability` discriminator from the payload.

---

## Cross-Domain Links

- **Consumes from queues produced by:** `apps/api/src/queues/jobs/enqueue-ingest.ts`, `enqueue-transcription.ts`, `enqueue-ai-generate.ts`
- **Re-enqueues into:** its own `media-ingest` queue (AI-generated files get post-processed)
- **Shares types with:** `packages/project-schema` (payloads + segment/waveform types)
- **Writes DB rows read by:** `apps/api` repositories (`asset`, `caption`, `aiGenerationJob`, `voice`) — which the web-editor polls via TanStack Query hooks

---

## Agent Instructions

**To add a new ingest-time derivation** (e.g. scene-change detection):
1. Add the column/ALTER in a new migration under `apps/api/src/db/migrations/` and a matching integration test.
2. Extend the ffprobe/ffmpeg step in `jobs/ingest.job.ts`.
3. Update the SQL `UPDATE project_assets_current SET ...` statement.
4. Add the field to `toAssetApiResponse` in `apps/api/src/services/asset.response.service.ts`.
5. Add a test to `ingest.job.test.ts` with a stubbed ffprobe response.

**To add a new fal.ai model capability:**
1. Add the capability to `FalCapability` in `jobs/ai-generate.output.ts` AND to `AiCapability` in `apps/api/src/repositories/aiGenerationJob.repository.ts` (both files must stay in sync with migration 015's ENUM).
2. Add a `parseFalOutput` branch matching the model's output shape.
3. Update the migration ENUM if the new value isn't already covered (new migration).
4. Declare the model in `packages/api-contracts/src/fal-models.ts` with its option schema.
5. The dispatcher in `ai-generate.job.ts` routes by capability, so no changes there unless the parse shape is fundamentally different.
6. Add tests: a parser fixture in `ai-generate.output.ts` tests and a full-flow test in `ai-generate.job.test.ts`.

**To add a new ElevenLabs capability:**
1. Add a typed wrapper function in `lib/elevenlabs-client.ts` (pattern: `apiKey` as param, `Buffer` or typed result out, throws `ElevenLabsError` on non-2xx).
2. Add a case to `processElevenLabsCapability` in `ai-generate-audio.handler.ts`.
3. Add the capability string to `AudioCapability` in `ai-generate.output.ts`.
4. Add model entry to `packages/api-contracts/src/elevenlabs-models.ts`.
5. Wire into `index.ts` deps: add the new fn to the `ElevenLabsClientFns` injected into `aiGenerateWorker`.
6. Unit tests for the new client function + handler branch.

**To add a brand-new worker queue:**
1. Define payload type in `packages/project-schema/src/types/job-payloads.ts`.
2. Producer: new `apps/api/src/queues/jobs/enqueue-<name>.ts` + `new Queue(NAME)` in `queues/bullmq.ts`.
3. Consumer: new `apps/media-worker/src/jobs/<name>.job.ts` — follow the `processIngestJob(job, { ...deps })` pattern.
4. Register a new `Worker` in `src/index.ts` with deps wired from `config`; add its `close()` call to `shutdown()`.
5. Unit + integration tests.

**Environment / config:**
- `config.ts` is the **only** file allowed to read `process.env`. All handlers receive dependencies explicitly — pass `config.fal.key` / `config.elevenlabs.apiKey` / `config.s3.bucket` at the bootstrap site in `index.ts` and nowhere else.
- Never import `@/config` from a file under `jobs/` or `lib/` — that breaks the dep-injection pattern and makes tests require module mocking.

**Error handling:**
- Handlers throw on any error — BullMQ catches, marks the job failed, and retries per the queue's backoff policy (default, not currently tuned per-queue).
- Inside the `ai-generate` flow, wrap the whole body in try/catch to update `ai_generation_jobs.status='failed'` + `error_message` BEFORE re-throwing, so the API polling endpoint can surface the reason to the FE.

**FFmpeg / FFprobe:** Available inside the media-worker container via the `apps/media-worker/Dockerfile`. For local non-Docker dev (discouraged — see `project_dev_workflow` memory), both binaries must be on `PATH`.
