---
id: T12
title: "Scene-image generation: references feed scenes + text-only fallback"
layer: "infra"
deps: ["T10"]
acs: ["AC-04", "AC-10", "AC-11"]
files_hint:
  - "apps/media-worker/src/jobs/ai-generate.job.ts"
  - "apps/media-worker/src/jobs/storyboardOpenAIImage.job.ts"
  - "apps/media-worker/src/jobs/referenceSelection.ts"
owner: "Backend"
estimate: "M"
status: "todo"
---

# T12 — Scene-image generation

## Why

Each scene must illustrate from its linked Ready reference outputs when it has them (AC-10) and from text alone when it does not (AC-11) — and a missing reference must never block the batch; a per-scene failure must not fail the phase (AC-04). Derives from [Flow 7 (sad §6)](../sad.md), [data-model §No-change findings](../data-model.md), [spec §AC-04/10/11](../spec.md).

## What

In the scene-image jobs:
- for each scene, read its `storyboard_reference_scene_links` joined to `storyboard_reference_stars` (selected output) where `window_status = 'done'` ("Ready") → feed those reference outputs + any directly-attached image + the scene text (AC-10);
- when a scene has **no** Ready linked reference (none, or only failed/cancelled/skipped) → generate from text + attached image alone, **do not block** the batch (AC-11);
- record each scene's terminal result (`storyboard_scene_illustration_jobs.status`); a failed scene is left without an image and re-triggerable; on **all** scenes terminal, the completion-hook (T10) advances the phase to `completed` **even if some scenes failed** (AC-04).

## Definition of Done

- [ ] Integration tests: a scene with a Ready reference feeds its selected output; a scene with only a failed/skipped reference falls back to text-only; the phase completes with some scenes failed and those scenes stay re-triggerable.
- [ ] A "Ready" reference is strictly `window_status = 'done'` with a selected star output.
- [ ] lint + vet clean.

## Notes

- Shares `ai-generate*` files with T10 → same lane.
- Reuses `referenceSelection.ts` for the selected-output resolution; relaxes the inherited reference-done gate (a link without a Ready output = no reference, spec §1).
