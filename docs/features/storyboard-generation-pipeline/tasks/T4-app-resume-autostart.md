---
id: T4
title: "Resume read: auto-start scene generation + lazy stuck-release"
layer: "app"
deps: ["T3"]
acs: ["AC-01", "AC-05", "AC-12"]
files_hint:
  - "apps/api/src/services/storyboardPipeline.resume.service.ts"
owner: "Backend"
estimate: "M"
status: "todo"
---

# T4 — Resume read: auto-start + lazy stuck-release

## Why

Opening Step 2 must reconstruct the exact screen and, on a fresh draft, begin scene generation without a button (AC-01); a closed-tab stuck phase must release the moment a client reads (AC-12). Derives from [spec §AC-01/05/12](../spec.md), [openapi GET …/pipeline](../contracts/openapi.yaml), [ADR-0004](../adr/0004-resume-by-single-state-read-with-observer-tabs.md), [ADR-0005](../adr/0005-release-stuck-phases-via-lazy-read-and-reaper.md).

## What

`getPipelineState(draftId)`:
- lazily `insertFresh` + claim the scene run + enqueue scene generation when no row exists (AC-01 auto-start) — idempotent on repeat open (T2 single-active-run decision);
- **lazy stuck-release:** if the active phase is `running` and `heartbeat_at` is past the configurable bound (`APP_*`, default 10 min), apply the `failed` transition + `error_message` and clear the run before projecting;
- project the row into the `PipelineState` shape ([openapi `PipelineState`](../contracts/openapi.yaml)) — never expose `phase_started_at` / `heartbeat_at` / `actual_cost` / `created_at`.

## Definition of Done

- [ ] Integration tests: fresh draft → row created + scene run claimed + enqueue once (a second call does not double-start, AC-14); resume returns the same running loader / `awaiting_review` modal; a seeded over-bound running row is released to `failed` on read (AC-12).
- [ ] The projection matches the `PipelineState` schema (internal columns omitted).
- [ ] lint + vet clean.

## Notes

- Own service file (`storyboardPipeline.resume.service.ts`) so it parallelizes with T5–T8.
- Enqueues onto the existing `storyboard-plan` queue ([events.md](../contracts/events.md)).
