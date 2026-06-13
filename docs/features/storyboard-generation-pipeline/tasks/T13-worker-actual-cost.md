---
id: T13
title: "Instrument actual cost + estimate-vs-actual delta"
layer: "infra"
deps: ["T10", "T5"]
acs: ["AC-03", "AC-04"]
files_hint:
  - "apps/media-worker/src/jobs/storyboardPipelineHooks.ts"
  - "apps/api/src/services/storyboardPipeline.cost.service.ts"
owner: "Backend"
estimate: "S"
status: "todo"
---

# T13 — Instrument actual cost + estimate-vs-actual delta

## Why

The ±10% NFR can only be *measured* if the actual cost of each expensive run is recorded alongside the estimate from day 1 (KPI; ADR-0006). Derives from [ADR-0006](../adr/0006-server-side-cost-estimate-instrument-defer-deduction.md), [spec §6/§7](../spec.md), [sad §7 (monitoring)](../sad.md).

## What

On each reference-image / scene-image run reaching terminal:
- compute the run's actual cost from the units that actually generated;
- persist it to `actual_cost` on the pipeline row;
- emit the `cost_estimate_actual_delta_pct` metric (sad §7) for the run.

**No deduction** — instrument-only (ADR-0006); real credit deduction is the deferred §11 OQ.

## Definition of Done

- [ ] Integration test asserts `actual_cost` is persisted for a completed expensive phase and the delta metric is emitted.
- [ ] lint + vet clean.

## Notes

- Touches the shared `storyboardPipelineHooks.ts` (T10) + the cost service (T5) → serialized after both.
- `actual_cost` is telemetry-only — it is **not** exposed in `PipelineState` (api-sync-report).
