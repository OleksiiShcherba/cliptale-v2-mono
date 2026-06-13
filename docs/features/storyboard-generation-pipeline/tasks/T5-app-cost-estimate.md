---
id: T5
title: "Server-side cost estimate compute + re-validate"
layer: "app"
deps: ["T3"]
acs: ["AC-03", "AC-04"]
files_hint:
  - "apps/api/src/services/storyboardPipeline.cost.service.ts"
owner: "Backend"
estimate: "M"
status: "todo"
---

# T5 — Server-side cost estimate compute + re-validate

## Why

The cast-proposal and scene-image modals must show a server-computed price (AC-03, AC-04), and the estimate must be re-validated server-side at confirm time so a tampered client value can never under-charge (§6.1). Derives from [ADR-0006](../adr/0006-server-side-cost-estimate-instrument-defer-deduction.md), [spec §6.1](../spec.md).

## What

`storyboardPipeline.cost.service.ts`:
- `computeReferenceImageEstimate(draftId)` — price the reference-image run from the proposed cast; persist to `cost_estimate` when the cast proposal is stored;
- `computeSceneImageEstimate(draftId)` — price the scene-image run from the scene count;
- `revalidateEstimate(draftId, phase)` — recompute server-side at confirm/accept and reject (`pipeline.estimate_revalidation_failed`) if it cannot be reproduced. **No client-supplied estimate is ever trusted.**

Deduction is **out of scope** (instrument-only, ADR-0006) — this task computes, re-validates and persists the estimate; the *actual* cost is T13.

## Definition of Done

- [ ] Unit tests cover the compute for both phases and the re-validation rejection path.
- [ ] `cost_estimate` is serialized as the fixed-scale decimal string the `PipelineState` schema requires (`^[0-9]+\.[0-9]{4}$`).
- [ ] lint + vet clean.

## Notes

- Own service file → parallel with T4.
- Matches `aggregate_estimate_credits` units (data-model). No `users.credits` substrate exists — do not attempt a balance gate (ADR-0006).
