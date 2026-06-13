---
status: Draft
owner: "Backend Lead"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-06-13"
feature_size: L
---

# Events — storyboard-generation-pipeline

Async contract for the worker surface (`target_surfaces: [..., worker, ...]`) and the realtime
state-convergence channel. Derived from `sad.md` §6: the `Worker` participant on Flows 1/2/3/6/7 and
the "publish state" messages on every transition.

> **Deliberate deviation from the SDD events template** (justified — reflects repo reality so this
> is the contract that actually ships):
> - The state-convergence event **reuses the existing `storyboard.status.updated` channel**
>   (`apps/api/src/lib/realtimePublisher.ts:37`), not a new `module.action.vN` name.
> - The envelope is the repo's **camelCase** shape (`eventId` / `occurredAt` / `userId` / `draftId` /
>   `payload`), not the template's snake_case `event_id` / `occurred_at` / `data`.
> - Phase work is dispatched on the repo's existing **BullMQ kebab-case queues** (`ai-generate`,
>   `storyboard-plan`, `storyboard-openai-image`), not a new broker topic.

---

## Channel: `storyboard.status.updated` (realtime state convergence)

The load-bearing async fact of this feature. On **every** pipeline transition the writer publishes the
**full** `PipelineState` so observer tabs converge without a lock (ADR-0004, §8). It is the only
event a frontend consumer subscribes to; the HTTP `GET …/pipeline` read is the authoritative fallback.

- **Producer:** `api` **and** `media-worker` — whichever process runs the transition, via the shared
  transition module (ADR-0003). Published to Redis pub/sub → relayed over WebSocket.
  (`apps/api/src/lib/realtimePublisher.ts`, `apps/api/src/lib/realtime.ts`.)
- **Consumers:** `web-editor` — the `usePipelineState` hook (one subscription per open Step-2 tab,
  including observer tabs).
- **Delivery:** at-least-once (Redis pub/sub). **Missed events self-heal** — the resume read on open
  reconstructs true state, so no DLQ is required for this channel (ADR-0004, §11 realtime-lag risk).
- **Ordering:** none guaranteed by the bus; the `version` field is the authority — a consumer
  **ignores any event whose `version` ≤ the version it already holds** (out-of-order / duplicate guard).

### Event payload — `storyboard.status.updated`

Envelope = the existing repo shape; `payload` carries the projected `PipelineState`
(`openapi.yaml#/components/schemas/PipelineState`).

```json
{
  "eventId": "33333333-3333-4333-8333-333333333333",
  "eventType": "storyboard.status.updated",
  "occurredAt": "2026-06-13T10:05:00.000Z",
  "userId": "44444444-4444-4444-8444-444444444444",
  "draftId": "11111111-1111-4111-8111-111111111111",
  "payload": {
    "draft_id": "11111111-1111-4111-8111-111111111111",
    "active_phase": "reference_data",
    "active_run_phase": null,
    "phases": {
      "scene": { "status": "completed" },
      "reference_data": { "status": "awaiting_review" },
      "reference_image": { "status": "idle" },
      "scene_image": { "status": "idle" }
    },
    "payload": { "cast_proposal": { "references": [] } },
    "version": 7,
    "cost_estimate": "12.5000",
    "error_message": null,
    "updated_at": "2026-06-13T10:05:00.000Z"
  }
}
```

- **Required fields:** `eventId, eventType, occurredAt, userId, draftId, payload`.
- **Origin:** §6 Flow 1 ("Worker → Api: publish state"), Flow 2 (observer convergence + stuck-release),
  Flows 3/6 (cancel/confirm transitions).
- **Authorization (AC-13):** delivery is owner-scoped — only the draft owner's session receives the
  event; the event never widens the read surface beyond the HTTP gate.
- **Backwards-compat:** additive-only; the `payload` body follows the OpenAPI `PipelineState` schema —
  a removed/renamed field is a coordinated change with the HTTP contract, not an event-only bump.

---

## Phase-work jobs (BullMQ — internal worker dispatch)

The pipeline enqueues phase work onto the **existing** queues; the worker's completion-hooks call the
shared transition module, which advances the state and publishes `storyboard.status.updated`
(ADR-0003). These are internal jobs, not consumer-facing events — documented here so the worker
surface is complete.

| Phase | Queue (existing) | Job name(s) | Producer | Concurrency / retry |
|---|---|---|---|---|
| scene generation | `storyboard-plan` | `storyboard-plan` | `api` on auto-start (GET) | BullMQ attempts; heartbeat → stuck-release ≤ 10 min |
| reference-data (cast proposal) | `storyboard-plan` | `cast-extract` | `api` (auto, after scene) | BullMQ attempts; heartbeat |
| reference-image | `ai-generate` | `ai-generate` (per reference) | `api` on confirm-cast | **rolling window ≤ 4** (NFR); per-unit `window_status`; incremental re-trigger skips `done` |
| scene-image | `ai-generate` / `storyboard-openai-image` | `ai-generate` / `storyboard-openai-image` (per scene) | `api` on trigger `scene_image` | per-unit; failed scene left re-triggerable; phase completes despite per-unit failures (AC-04) |

- **Completion-hook → transition (ADR-0003):** on each unit's terminal result the worker records
  per-unit state (`storyboard_reference_blocks.window_status`, `storyboard_scene_illustration_jobs.status`)
  and, when **all** units of the phase are terminal, runs the transition (version CAS) and publishes.
- **Idempotency / single active run (AC-14, ADR-0007):** a phase claims its run only when
  `active_run_phase IS NULL` (CAS); a duplicate enqueue is rejected at claim time — no client key.
- **Cancel (AC-06, ≤ 5 s):** the transition clears the active-run marker; the worker enqueues **no**
  new units after the marker is cleared (an in-flight unit may still finish; its result is kept).

## Reaper job — stuck-phase release (ADR-0005)

- **Job:** `storyboardPipelineReaper.job.ts` — a **BullMQ repeatable** job (new).
- **Sweep:** `WHERE active_run_phase IS NOT NULL AND heartbeat_at < NOW(3) - INTERVAL 10 MINUTE`
  (served by `idx_storyboard_pipeline_active_heartbeat`).
- **Action:** marks the phase `failed`, sets `error_message`, clears the active-run marker, bumps
  `version`, publishes `storyboard.status.updated` → loader released, retry offered (AC-12). The HTTP
  read does the same lazy-on-read; the reaper covers closed-tab drafts.
- **Bound:** 10 min, configurable via `APP_*` (resolves OQ-3); heartbeat tracks **real per-unit
  progress**, not wall-clock, to limit the slow-but-healthy false-positive (§11 risk).

## Schema registry

- Canonical event envelope + payload types: `@ai-video-editor/project-schema` (the package the repo
  already imports realtime payload types and BullMQ job payloads from — `realtimePublisher.ts`,
  `apps/api/src/queues/`).
- Validator: the repo's existing Zod schemas in that package — no new validator introduced.
