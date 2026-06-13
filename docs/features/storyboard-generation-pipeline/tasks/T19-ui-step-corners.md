---
id: T19
title: "StepCorners corner controls + plain-language guard messages"
layer: "ui"
deps: ["T15"]
acs: ["AC-08", "AC-15"]
files_hint:
  - "apps/web-editor/src/features/storyboard/components/StepCorners.tsx"
owner: "Frontend"
estimate: "M"
status: "todo"
---

# T19 — StepCorners corner controls

## Why

The Creator manually (re-)triggers any step from corner controls, and a trigger that breaks phase order or precedes scene generation must surface the server's plain-language reason — not a dead end (AC-08, AC-15). Derives from [spec §AC-08/15](../spec.md), [openapi …/trigger 422](../contracts/openapi.yaml), [Flow 5 (sad §6)](../sad.md).

## What

- Corner controls listing the four phases, each triggering `triggerPhase(phase)` (T15);
- on a `422` (`pipeline.phase_out_of_order` / `pipeline.scenes_required`), surface the server's plain-language `error` message;
- reflect the live sub-state per phase (idle / running / completed / skipped / failed) from `usePipelineState`.

## Definition of Done

- [ ] Component tests: a trigger calls `triggerPhase`; an out-of-order `422` shows the "phases run in strict order" message; a scenes-required `422` shows the "generate scenes first" message.
- [ ] lint + vet clean.

## Notes

- **Reuse `ReferenceGateMessage`** (`components/ReferenceGateMessage.tsx`) for the plain-language guard surface — do not invent a new message component.
- Parallel with T16/T17/T18.
