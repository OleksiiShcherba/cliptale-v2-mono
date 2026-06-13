---
id: T10
title: "Worker completion-hooks advance phases via the transition module"
layer: "infra"
deps: ["T2", "T3"]
acs: ["AC-02", "AC-03", "AC-04"]
files_hint:
  - "apps/media-worker/src/jobs/storyboardPipelineHooks.ts"
  - "apps/media-worker/src/jobs/storyboardPlan.job.ts"
  - "apps/media-worker/src/jobs/cast-extract.job.ts"
  - "apps/media-worker/src/jobs/ai-generate.referenceWindow.ts"
owner: "Backend"
estimate: "M"
status: "todo"
---

# T10 — Worker completion-hooks advance phases

## Why

Phases advance when worker units finish — scene generation → reference-data → cast modal (AC-02), reference-image all-terminal → scene-image offer (AC-03), scene-image all-terminal → completed (AC-04). The worker reports completion; the **shared transition module** owns the advance. Derives from [ADR-0003](../adr/0003-advance-phases-via-worker-completion-hooks.md), [events.md §Phase-work jobs](../contracts/events.md), [Flow 1 (sad §6)](../sad.md).

## What

A single `storyboardPipelineHooks.ts` helper the existing jobs call on unit completion:
- record per-unit terminal state (already done by the jobs for `window_status` / illustration status);
- when **all** units of the phase are terminal, run the T2 transition (via the T3 repository `applyTransition` CAS) to advance the sub-state + set `payload_json` (next loader label or pending-modal data + estimate) and publish (T14);
- wire the hook into `storyboardPlan.job.ts` (scene done → reference-data), `cast-extract.job.ts` (reference-data done → `awaiting_review` cast proposal + estimate), and `ai-generate.referenceWindow.ts` (per-reference terminal; on all terminal → `scene_image` `awaiting_review` offer). A **failed** reference is tolerated — the phase still advances (AC-03).

## Definition of Done

- [ ] Integration tests: scene-plan completion advances to `reference_data` running, then `cast-extract` to `reference_data: awaiting_review` with a cost estimate (AC-02); all references terminal (incl. one failed) advances to the scene-image offer (AC-03).
- [ ] Transitions go through the shared module + `version` CAS — no job writes the pipeline row directly.
- [ ] lint + vet clean.

## Notes

- Shares the `ai-generate*` files with T12 (scene-image) → serialized into one lane; T12 deps T10 anyway.
- Heartbeat (`touchHeartbeat`, T3) is called on per-unit progress to feed stuck-release.
