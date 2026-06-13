---
id: T14
title: "Wire realtime publish + mount routes + register reaper"
layer: "wiring"
deps: ["T9", "T11"]
acs: ["AC-05"]
files_hint:
  - "apps/api/src/lib/realtimePublisher.ts"
  - "apps/api/src/index.ts"
  - "apps/media-worker/src/index.ts"
owner: "Backend"
estimate: "S"
status: "todo"
---

# T14 — Wire realtime publish + mount routes + register reaper

## Why

Observer tabs converge only if **every** transition publishes the full state on the existing channel (AC-05, ≤ 2 s), and the surface is live only once the routes are mounted and the reaper is scheduled. Derives from [ADR-0004](../adr/0004-resume-by-single-state-read-with-observer-tabs.md), [events.md §storyboard.status.updated](../contracts/events.md), [sad §7](../sad.md).

## What

- Add a `publishPipelineState(draftId, state)` helper on `realtimePublisher.ts` that emits the full projected `PipelineState` on the **existing** `storyboard.status.updated` channel, owner-scoped, version-stamped; the service (T4/T6/T7/T8) and worker hooks (T10/T11/T13) call it on every transition.
- Mount `storyboardPipeline.routes.ts` in the api app (`apps/api/src/index.ts`).
- Register the reaper repeatable (T11) in the worker bootstrap (`apps/media-worker/src/index.ts`).

## Definition of Done

- [ ] Integration test: a transition emits exactly one `storyboard.status.updated` event whose `payload.version` is monotonic; a consumer ignoring `version <=` held drops a stale/duplicate.
- [ ] Routes reachable end-to-end; the reaper repeatable is scheduled on boot.
- [ ] lint + vet clean.

## Notes

- Reuses the existing Redis pub/sub + ws (`publishStoryboardStatusUpdated`) — **no new channel** (events.md deviation).
- Missed events self-heal via the resume read (T4) — no DLQ for this channel.
