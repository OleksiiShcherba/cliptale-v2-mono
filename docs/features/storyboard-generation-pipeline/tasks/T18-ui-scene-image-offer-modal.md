---
id: T18
title: "SceneImageOfferModal (cost estimate, accept/skip)"
layer: "ui"
deps: ["T15"]
acs: ["AC-04", "AC-07"]
files_hint:
  - "apps/web-editor/src/features/storyboard/components/SceneImageOfferModal.tsx"
owner: "Frontend"
estimate: "S"
status: "todo"
---

# T18 — SceneImageOfferModal

## Why

Scene-image generation is offered with its precomputed price so the Creator decides to spend knowing the cost (AC-04), or skips it (AC-07). Derives from [spec §AC-04/07](../spec.md), [openapi `scene_image_offer`](../contracts/openapi.yaml), [Flow 1/4 (sad §6)](../sad.md).

## What

- Rendered when `scene_image` is `awaiting_review`; reads `payload.scene_image_offer` + `cost_estimate` (T15);
- **Accept** → `triggerPhase('scene_image')`; **Skip/dismiss** → `skipPhase('scene_image')`.

## Definition of Done

- [ ] Component tests: shows the scene-image cost estimate; accept calls `triggerPhase('scene_image')`; dismiss calls `skipPhase('scene_image')`.
- [ ] lint + vet clean.

## Notes

- Reuse the repo's existing modal primitives + tokens; `*.styles.ts` convention.
- Parallel with T16/T17/T19.
