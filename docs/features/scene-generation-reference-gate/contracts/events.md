# Events — scene-generation-reference-gate

> Derived from sad.md §6 Flow 3 (scene-job execution) + Flow 1/2 enqueue steps. **This feature
> introduces no new queue, no new channel, and no new event type** — the worker surface
> (`target_surfaces: worker`) changes *what the existing scene job reads* (selection + boundary)
> and *what the existing status event carries* (principal fields removed). Everything below is
> the reused contract with this feature's deltas marked.

## Queue: `storyboard-openai-image` (BullMQ, Redis) — existing, reused

- **Producer:** `api` — `enqueueStoryboardOpenAIImage` (apps/api/src/queues/jobs/enqueue-storyboard-openai-image.js), called from the start operations **only after the Reference-done gate passes** (Flows 1/2; gate evaluation itself enqueues nothing and triggers no paid generation — spec §6).
- **Consumer:** `media-worker` scene-illustration job.
- **Payload:** existing scene-job payload, unchanged — **minus** the legacy principal `referenceOutputFileId` input, which is replaced by the worker-side per-block selection below. (Exact payload field rename/removal is an implementation detail pinned at `sdd:tasks`; the contract-level fact is: the job no longer receives or reads a principal image.)
- **Delta — worker reads (Flow 3, AC-05/AC-06/AC-06b):** for scene S the worker
  1. reads ONLY the reference blocks linked to S (data-model Q7 — the **Reference boundary**: outputs of unlinked blocks are never read for S; invariant, 0-tolerance per spec §6);
  2. per linked block selects **exactly one output**: the primary star if its file is a live `flow_files` row (Q4+Q5), else the latest completed output (`ORDER BY created_at DESC, file_id DESC LIMIT 1`, Q6) — ADR-0003; a ready linked block is therefore never reference-less;
  3. zero-reference draft → generates from prompt + derived style description only (AC-04 branch).

## Channel: `cliptale:realtime:v1` (Redis pub/sub → ws `/realtime`) — existing, reused

## Event: `storyboard.status.updated` (v1) — existing, payload delta

- **Producer:** `api` (after start) and `media-worker` (after each scene job state change) via `publishStoryboardIllustrationStatus` / `publishStoryboardIllustrationFailure` (apps/api/src/services/storyboardIllustration.realtime.ts).
- **Consumers:** `web-editor` SPA (draft-storyboard subscription scope).
- **Payload:** `{ resource: "storyboardIllustrations", status: StoryboardIllustrationStatus }` — `status` is the same revised schema as the HTTP read (openapi.yaml): top-level `reference` **removed**, `automation.phase` **loses** `creating_principal_image` / `awaiting_principal_approval` (AC-08). **Breaking** for a consumer still rendering the principal step; the web-editor drops that step in this feature (US-07).
- **Failure variant:** existing `{ resource: "storyboardIllustrations", jobId, blockId?, status: "failed", errorMessage }` — unchanged.
- **Schema registry:** `packages/project-schema/src/schemas/realtime.schema.ts` (Zod) — `storyboard.status.updated` payload stays `z.record(z.unknown())` at the envelope level; the typed status shape lives in `storyboardIllustration.types.ts` and is revised there.

## NOT an event: gate readiness (AC-07)

The Reference-done gate **never subscribes to or awaits a completion signal**. Readiness is the
persisted output-existence read (`flow_files` rows) at gate-evaluation time — a block whose first
generation is still running simply has no persisted output and reads as not-ready (Flow 4,
CONTEXT "Reference-generation context"). No new event, no listener, no race.

## Idempotency & retry

Numbers are NOT invented here — they reuse the existing scene-job policies (the exact attempt
count is pinned in `apps/media-worker` BullMQ config, flagged for `sdd:tasks`).

- **Idempotency (HTTP side):** no `Idempotency-Key` header on the start endpoints (brownfield precedent) — the API's active-job dedupe (`isActiveIllustrationStatus`) guarantees a re-POST never duplicates an active scene job.
- **Idempotency (consume side):** the worker dedupes on `jobId` (Flow 3 step "перевіряє idempotency key") — a redelivered job is skipped if already processed.
- **Retry:** existing exponential-backoff policy on transient provider failure (Flow 3 note).
- **Dead-letter:** existing DLQ behaviour — exhausted retries route the job to dead-letter and the scene is marked `failed` (Flow 3 alt; surfaces to the Creator via the failure variant of `storyboard.status.updated`).
