---
id: T8
title: "Cancel + skip use cases (keep partials, skipped != idle)"
layer: "app"
deps: ["T4"]
acs: ["AC-06", "AC-07"]
files_hint:
  - "apps/api/src/services/storyboardPipeline.lifecycle.service.ts"
owner: "Backend"
estimate: "S"
status: "todo"
---

# T8 — Cancel + skip use cases

## Why

Cancel must free the Creator while keeping every produced result (AC-06); skip must record an *intentional* decline distinct from never-run so a later prerequisite check can tell them apart (AC-07). Derives from [Flow 3/4 (sad §6)](../sad.md), [openapi …/cancel + …/skip](../contracts/openapi.yaml), [ADR-0008](../adr/0008-incremental-retrigger-via-per-unit-terminal-state.md).

## What

`storyboardPipeline.lifecycle.service.ts`:
- `cancelPhase(draftId, phase)` — clear the active-run marker, signal the worker to enqueue **no** further units (takes effect ≤ 5 s; an in-flight unit may still finish, its result kept), set the phase to `idle`, keep every per-unit `done` result. A no-op (200) if the phase is not running.
- `skipPhase(draftId, phase)` — only valid when `awaiting_review` (else `pipeline.not_awaiting_review`); set the phase sub-state to `skipped` (distinct from `idle`); stays re-triggerable.

## Definition of Done

- [ ] Integration tests: cancel keeps all `done` units and returns `idle`; no new unit is enqueued after cancel; skip records `skipped` (≠ `idle`); skip on a non-`awaiting_review` phase returns `pipeline.not_awaiting_review` (422).
- [ ] lint + vet clean.

## Notes

- Own service file → parallel with T6/T7.
- Skipping the reference phases means linked scenes later fall back to text-only (AC-11, handled in T12).
