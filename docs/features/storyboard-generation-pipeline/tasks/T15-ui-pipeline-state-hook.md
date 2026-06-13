---
id: T15
title: "usePipelineState hook + retire client orchestration"
layer: "ui"
deps: ["T9"]
acs: ["AC-05"]
files_hint:
  - "apps/web-editor/src/features/storyboard/hooks/usePipelineState.ts"
  - "apps/web-editor/src/features/storyboard/api.ts"
owner: "Frontend"
estimate: "M"
status: "todo"
---

# T15 — usePipelineState hook + retire client orchestration

## Why

The frontend becomes a pure projection: one hook reads the backend state on open and converges via realtime, and the old client-owned orchestration (the thing that lost progress on reload) is removed (AC-05, ADR-0001). Derives from [ADR-0001](../adr/0001-own-orchestration-in-backend-pipeline-state-machine.md), [ADR-0004](../adr/0004-resume-by-single-state-read-with-observer-tabs.md), [sad §4 UI-architecture](../sad.md).

## What

- `usePipelineState(draftId)` — `GET …/pipeline` on open (TanStack Query) + subscribe to `storyboard.status.updated`; **ignore any event whose `version` ≤ the version held** (events.md ordering guard); expose `{ activePhase, phases, payload, costEstimate, errorMessage }` to the projection components.
- `api.ts` — the five pipeline endpoints (`getPipelineState`, `confirmCast`, `triggerPhase`, `cancelPhase`, `skipPhase`).
- **Retire** `useStoryboardPlanGeneration`, `useStoryboardIllustrations`, `useCastAutostart`, `useStoryboardGenerationFlow`, `useStep3Generation` and the `StoryboardAutomationPhase` client enum (client no longer owns generation state).

## Definition of Done

- [ ] Hook tests: resume renders the backend state on open; a `version ≤` event is ignored; a `version >` event updates.
- [ ] The retired hooks/enum are removed and no longer imported anywhere (build is green).
- [ ] lint + vet clean.

## Notes

- Gates all UI tasks (T16–T19) — they consume this hook.
- Retirement is large by file-count but mechanical; if removal + the new hook exceeds one reviewable PR, land the new hook first, then the deletions.
