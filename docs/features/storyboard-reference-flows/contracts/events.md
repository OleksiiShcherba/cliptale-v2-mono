---
status: Draft
owner: "Backend Lead"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-06-07"
feature_size: L
---

# Events — storyboard-reference-flows

Async contract for `sad.md` §6 Flow 1 (cast extraction + rolling window), Flow 2 (scene
generation) and Flow 7 (single-scene regeneration). Every entry maps to an enqueue/deliver/publish
message in those diagrams. **This feature introduces no new queue and no new channel** — it REUSES
the existing `storyboard-plan` and `ai-generate` BullMQ queues and the existing
`cliptale:realtime:v1` Redis pub/sub → ws relay (ADR-0002, SAD §8). What it adds is **one new job
type** (`cast-extract`) and **two new realtime event types** (extraction + block window statuses),
both following the repo's existing `<scope>.<entity>.updated` naming
(`packages/project-schema/src/schemas/realtime.schema.ts`: `storyboard.status.updated`,
`ai.job.updated`).

## Queue: `storyboard-plan` (BullMQ, Redis) — existing, reused (ADR-0002)

- **Producer:** `api` `storyboardReference.service` — enqueues one `cast-extract` job per accepted
  `POST …/references/extract` (Flow 1 «ставить екстракцію в чергу storyboard-plan»).
- **Consumer:** `apps/media-worker` — new `cast-extract.job.ts` handler on the existing queue.
- **Delivery:** at-least-once (BullMQ). Extraction is free (no charge) — a redelivery re-runs the
  LLM call at worst; the handler upserts by `jobId` so the stored proposal is written once.
- **Ordering:** none required (one job ↔ one draft extraction run).

### Job payload (enqueue — Flow 1)

Every field traces to a `storyboard_cast_extraction_jobs` column:

```json
{
  "jobId": "<storyboard_cast_extraction_jobs.id>",
  "draftId": "<storyboard_cast_extraction_jobs.draft_id>",
  "userId": "<storyboard_cast_extraction_jobs.user_id — owner scope, AC-13>"
}
```

The worker reads the script from the draft (script = data, never instructions — spec §6.1),
constrains the LLM output to the cast Zod schema, trims to the cast size limit (12) keeping the
entries appearing in the most scenes (AC-02), computes per-run estimates via the existing
`flow-pricing` (`getPriceForModel`), and writes `proposal_json` + `aggregate_estimate_credits` +
`status='completed'` (or `status='failed'` + `error_message`).

## Queue: `ai-generate` (BullMQ, Redis) — existing, reused (ADR-0003/0004)

- **Producer (first runs):** `api` `storyboardReference.service` — on `POST …/references/confirm`
  enqueues the first N generations (N = `concurrencyLimit`, default 4) in cast order; each block
  row is the window state (`window_status: pending → running → done/failed`).
- **Producer (window continuation):** `apps/media-worker` completion-hook in `ai-generate.job.ts` —
  on EVERY terminal outcome (success or failure) atomically claims the next pending block of the
  same draft (`UPDATE … WHERE draft_id=? AND window_status='pending' ORDER BY sort_order LIMIT 1`,
  served by `idx_storyboard_reference_blocks_draft_window`) and enqueues its generation. The claim
  is idempotent — concurrent completions never double-enqueue one block (ADR-0003).
- **Producer (scene generation):** the existing storyboard illustration service — unchanged
  surface; the scene generation master gains the reference boundary (reads each scene's linked
  blocks' stars; primary first, topped up to model capacity — ADR-0008) and the draft-global
  derived style description for unlinked scenes (ADR-0007, falls back to the script with zero
  starred results — AC-08b).
- **Consumer:** `apps/media-worker` `ai-generate` handler — existing.
- **Delivery:** at-least-once. A redelivered job MUST NOT double-charge — the existing worker-side
  idempotency key (keyed on `jobId`) skips an already-processed job (Flow 7 «перевіряє
  idempotency-ключ»); charging is per run at start (ADR-0004).
- **Ordering:** cast order is enforced by the DB claim (`sort_order`), not the queue — the window
  state survives api/worker restarts (ADR-0003, quality goal 3).

### Job payload — existing `ai-generate` payload, reused

First runs of reference flows are ordinary flow generations: the existing payload
(`jobId, userId, modelId, capability, prompt, options, flowId, blockId` — see
`generate-ai-flow/contracts/events.md`) is reused verbatim; `flowId` is the auto-created reference
flow. The window linkage lives in DB state (`storyboard_reference_blocks.first_job_id`), NOT in
the payload — no payload extension is needed.

## Channel: `cliptale:realtime:v1` (Redis pub/sub → ws `/realtime`) — existing, reused

- **Producer:** `media-worker` (extraction progress, window statuses) and `api` (status changes it
  authors, e.g. retry → pending).
- **Consumers:** `web-editor` — the storyboard canvas and the cast confirmation modal.
- **Delivery:** at-least-once; reattach fallback via `GET …/references/extraction` and
  `GET …/references/blocks` (last-known state on reopen — a missed message is never lost work).
- **Ordering:** none guaranteed; statuses are monotonic enough for the UI.

## Event: `storyboard.cast_extraction.updated` (v1) — NEW

Flow 1 «прогрес і результат (realtime)». Status-only push — the client fetches the proposal via
`GET …/references/extraction` on `completed` (mirrors the `ai.job.updated` pattern: no large JSON
over the ws).

```json
{
  "type": "storyboard.cast_extraction.updated",
  "jobId": "<storyboard_cast_extraction_jobs.id>",
  "draftId": "<storyboard_cast_extraction_jobs.draft_id>",
  "status": "queued | running | completed | failed",
  "aggregateEstimateCredits": "<storyboard_cast_extraction_jobs.aggregate_estimate_credits — null until completed>",
  "errorMessage": "<storyboard_cast_extraction_jobs.error_message — null unless failed>"
}
```

- **Required fields:** `type`, `jobId`, `draftId`, `status`.
- **Origin:** sad.md §6 Flow 1 → «Worker-->>Web: прогрес і результат (realtime)».
- **Backwards-compat policy:** additive-only; removing/renaming a field is a new version (`v2`).
  Subscribers must ignore unknown fields.

## Event: `storyboard.reference_block.updated` (v1) — NEW

Flow 1 rolling-window loop «Worker-->>Web: статуси блоків (realtime)» + AC-04 (per-block failed
status with a plain-language reason).

```json
{
  "type": "storyboard.reference_block.updated",
  "blockId": "<storyboard_reference_blocks.id>",
  "draftId": "<storyboard_reference_blocks.draft_id>",
  "windowStatus": "pending | running | done | failed",
  "errorMessage": "<storyboard_reference_blocks.error_message — null unless failed (AC-04)>",
  "previewFileId": "<derived primary-star fileId — null until a star exists (AC-06/AC-07)>"
}
```

- **Required fields:** `type`, `blockId`, `draftId`, `windowStatus`.
- **Origin:** sad.md §6 Flow 1 loop (success/failure alt-branches), Flow 4 (preview fallback push).
- **Outcome semantics (Flow 1 alt):**
  - **success** → block `windowStatus: "done"`; the result lands in the linked flow via the
    existing rails (`files` + `flow_files`); the completion-hook claims the next pending.
  - **failure** → block `windowStatus: "failed"` + `errorMessage`; the canvas shows the retry
    action (`POST …/references/blocks/{blockId}/retry`); other blocks continue unaffected — the
    completion-hook claims the next pending on failure too (AC-04).
- **Backwards-compat policy:** additive-only; new version on removal/rename.

## Event: `ai.job.updated` (v1) — existing, reused unchanged

Scene-generation progress (Flow 2 «прогрес (realtime)», Flow 7 «статус сцени (realtime)») and
in-flow reference generations reuse the existing event verbatim — no payload change. The reference
boundary (AC-09) is worker-internal DB reads (links + stars at generation time), not an event
field.

## Idempotency & retry

Numbers are NOT invented here — they reuse the existing queue policies (ADR-0002/0003; the exact
attempt count is pinned in `apps/media-worker` BullMQ config, flagged for `sdd:tasks`).

- **Idempotency (HTTP side):** `Idempotency-Key` required on `POST …/extract`, `POST …/confirm`,
  `POST …/blocks/{blockId}/retry` (TTL 24h, repo precedent) — a double-submit never creates two
  extraction jobs, two casts, or two retries.
- **Idempotency (consume side):** the worker dedupes on `jobId`; the completion-hook's atomic
  claim guarantees one enqueue per pending block under concurrent completions (ADR-0003).
- **Retry (extraction):** failed extraction is NOT auto-retried — the Creator re-runs
  `POST …/extract` (the jobs table allows multiple rows per draft).
- **Retry (first generations):** existing `ai-generate` policy — exponential backoff on transient
  provider failure; exhausted retries mark the block `failed` + `error_message`; the Creator's
  retry returns the row to `pending` with a fresh per-run charge at start (ADR-0004).
- **Dead-letter:** existing `ai-generate` DLQ behaviour, unchanged; on-call drains it.

## Schema registry

- Registry: `packages/project-schema/src/schemas/realtime.schema.ts` — the canonical Zod schemas;
  the two new event types are added there (additive union members).
- Validator: Zod (the repo's existing validator) — the worker validates payloads on enqueue, the
  client narrows on `type`.
