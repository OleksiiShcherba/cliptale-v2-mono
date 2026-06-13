---
id: T7
title: "Trigger phase: order guard, scenes-required guard, incremental re-trigger"
layer: "app"
deps: ["T4"]
acs: ["AC-04", "AC-06", "AC-08", "AC-15"]
files_hint:
  - "apps/api/src/services/storyboardPipeline.trigger.service.ts"
owner: "Backend"
estimate: "M"
status: "todo"
---

# T7 — Trigger phase: guards + incremental re-trigger

## Why

The generic phase-start command backs the corner-control trigger, accepting the scene-image offer (AC-04), the strict phase-order block (AC-08), the scenes-required block (AC-15) and incremental re-trigger after cancel/partial-failure (AC-06). Derives from [openapi POST …/phases/{phase}/trigger](../contracts/openapi.yaml), [Flow 3/5 (sad §6)](../sad.md), [ADR-0008](../adr/0008-incremental-retrigger-via-per-unit-terminal-state.md).

## What

`triggerPhase(draftId, phase)`:
- run the T2 **phase-order guard** (prerequisite must be `completed`/`skipped` → `pipeline.phase_out_of_order`) and **scenes-required guard** (trigger `scene_image` with zero scenes → `pipeline.scenes_required`);
- if the phase is already running, return the existing run (200, AC-14);
- accept the scene-image offer when `phase = scene_image` is `awaiting_review` (AC-04);
- **incremental re-trigger:** read per-unit terminal state (`window_status` / `storyboard_scene_illustration_jobs.status`) and enqueue **only** non-terminal units — `done`/`ready` units are never re-enqueued or re-charged; if every unit is already done, return `completed` with no enqueue (Flow 3 `else`).

## Definition of Done

- [ ] Integration tests: out-of-order trigger → `pipeline.phase_out_of_order`; `scene_image` with no scenes → `pipeline.scenes_required`; re-trigger after a partial run enqueues only the unfinished units; all-done re-trigger enqueues nothing.
- [ ] lint + vet clean.

## Notes

- Own service file → parallel with T6/T8.
- The actual generation runs in the worker (T12); this task owns the guard + the selective enqueue.
