---
status: Draft
owner: "Backend Lead"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-06-03"
feature_size: L
---

# Events — generate-ai-flow

Async contract for `sad.md` §6 Flow 1 / Flow 8 (the Generate → media-worker outcome). Every event
here maps to an enqueue/deliver/publish message in those diagrams. **This feature introduces no new
channel and no new queue** — it REUSES the existing `ai-generate` BullMQ queue and the existing
`cliptale:realtime:v1` Redis pub/sub → ws relay (ADR-0001). What it adds is two nullable linkage
fields (`flowId`, `blockId`) on the already-published `ai.job.updated` event, so the client maps an
update to the flow's result block (AC-08b).

## Queue: `ai-generate` (BullMQ, Redis) — existing, reused

- **Producer:** `api` `flow-generate.service` — enqueues one job per accepted Generate (Flow 7, after
  the validation gate + rate-limit pass).
- **Consumer:** `apps/media-worker` `ai-generate` handler — extended to honor `job.flowId` /
  `job.blockId` and write the `flow_files` link on success (ADR-0001 / ADR-0007).
- **Delivery:** at-least-once (BullMQ). A redelivered job MUST NOT double-charge — see Idempotency.
- **Ordering:** none required (one job ↔ one result block; independent runs).

### Job payload (enqueue — `sad.md` §6 Flow 7 “enqueues the ai-generate job”)

The existing ai-generate job payload (validated by the Zod schema in `packages/project-schema`)
EXTENDED with the flow linkage (ADR-0001). Every field traces to `ai_generation_jobs` /
`data-model.md`:

```json
{
  "jobId": "<ai_generation_jobs.job_id>",
  "userId": "<ai_generation_jobs.user_id — owner scope>",
  "modelId": "<ai_generation_jobs.model_id>",
  "capability": "<ai_generation_jobs.capability>",
  "prompt": "<existing — content only, never interpreted as instructions (spec §6.1)>",
  "options": { "<existing optional model params>": "..." },
  "flowId": "<ai_generation_jobs.flow_id — NEW, nullable>",
  "blockId": "<ai_generation_jobs.block_id — NEW, nullable>"
}
```

## Channel: `cliptale:realtime:v1` (Redis pub/sub → ws `/realtime`) — existing, reused

- **Producer:** `media-worker` (progress / completion / failure) — publishes job updates as it runs.
- **Consumers:** `web-editor`, subscribed over ws `/realtime` with `{ type: "subscribe",
  scope: "ai-job", jobId }`; auth via the `?token=` query param (media tags can’t send headers).
- **Delivery:** at-least-once (pub/sub fan-out + reattach poll fallback via `GET /ai/jobs/{jobId}`).
- **Ordering:** none guaranteed; `status` + `progress` are monotonic enough for the UI, and the
  flow read returns last-known state on reopen (AC-08b) so a missed message is never lost work.

## Event: `ai.job.updated` (v1) — existing, reused (payload extended)

The existing realtime event (`packages/project-schema/src/schemas/realtime.schema.ts`), reused
verbatim for flow generations. This feature adds the nullable `flowId` / `blockId` so the client
routes the update to the right result block (Flow 1/2/8, AC-08 / AC-08b / AC-09).

```json
{
  "type": "ai.job.updated",
  "jobId": "<ai_generation_jobs.job_id>",
  "status": "queued | running | done | failed",
  "progress": 0,
  "outputFileId": "<ai_generation_jobs.output_file_id — null until success>",
  "resultUrl": "<presigned URL — null until success>",
  "errorMessage": "<plain-language failure reason — null unless failed (AC-09)>",
  "flowId": "<ai_generation_jobs.flow_id — NEW, nullable>",
  "blockId": "<ai_generation_jobs.block_id — NEW, nullable>"
}
```

- **Required fields:** `type`, `jobId`, `status`, `progress`.
- **Origin:** `sad.md` §6 Flow 1 (“publishes progress / completion”), Flow 8 (success / failure /
  retries-exhausted branches).
- **Outcome semantics (Flow 8, result integrity — spec §6):**
  - **success** → worker keeps the first output (discards extras, AC-14), uploads to S3, writes the
    `files` row + `flow_files` link, marks the job `done`, publishes `status: "done"` with
    `outputFileId` + `resultUrl`. A library asset exists **iff** the job succeeded.
  - **failed / empty output** → marks the job `failed`, writes **no** asset and **no** `flow_files`
    link, publishes `status: "failed"` with `errorMessage`. The client shows the AC-09 failed state
    + retry (retry = a fresh, charged Generate — AC-09).
- **Backwards-compat policy:** additive-only. `flowId` / `blockId` are new optional fields;
  non-flow consumers ignore them. Removing/renaming a field is a new version (`v2`).

## Idempotency & retry

Numbers are NOT invented here — they reuse the existing `ai-generate` queue configuration; the
exact attempt count `N` is pinned in `apps/media-worker` BullMQ config (flagged for `sdd:tasks` in
`sad.md` §6 / §11).

- **Idempotency:** the worker checks the job idempotency key (keyed on `jobId`) and skips a job it
  already processed (Flow 8, first step), so a redelivery never double-charges. The HTTP
  `POST …/generate` `Idempotency-Key` header (TTL 24h) protects the *submit* side; the worker key
  protects the *consume* side.
- **Retry:** up to `N` attempts with exponential backoff on transient provider failure (existing
  queue policy — Flow 8 “retry up to N times”).
- **Dead-letter:** after `N` exhausted attempts the job is routed to the dead-letter queue and
  surfaced as a failed run (`status: "failed"`); on-call drains per the existing queue runbook.

## Schema registry

- **Registry:** `packages/project-schema/src/schemas/realtime.schema.ts` (Zod) — canonical
  `ai.job.updated` shape; `packages/project-schema` for the ai-generate job payload.
- **Validator:** Zod (the schema-first convention the repo already uses); no separate broker schema
  registry — the shared package IS the registry.
