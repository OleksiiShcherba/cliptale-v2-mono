---
id: T7
title: "motionGraphic.cost.service — estimate + server re-validation mirror"
layer: "app"
deps: []
acs: ["AC-11"]
files_hint:
  - "apps/api/src/services/motionGraphic.cost.service.ts"
owner: "Backend Lead"
estimate: "S"
status: "todo"
---

# T7 — motionGraphic.cost.service (estimate + revalidate)

## Why

The cost gate must re-compute the estimate server-side and refuse on mismatch, never trusting the client. Derives from [spec AC-11, §6.1](../spec.md) + [sad §8 Cost gate](../sad.md), mirroring `storyboardPipeline.cost.service.ts`.

## What

Add `apps/api/src/services/motionGraphic.cost.service.ts`: compute a server-side generation/refinement estimate (DECIMAL string form, as the pipeline service does) and `revalidateEstimate({ serverEstimate, clientEstimate })` applying the **same exact-match rule** as the existing service, throwing a `GateError` (`motion_graphic.estimate_revalidation_failed`, 422, `details: { serverEstimate, clientEstimate }`) on mismatch. Instrument-only — **no credit ledger**.

## Definition of Done

- [ ] Estimate computed server-side; match rule identical to `storyboardPipeline.cost.service` (exact match)
- [ ] Mismatch → `GateError` `motion_graphic.estimate_revalidation_failed` with server/client values in `details` (AC-11)
- [ ] Unit tests cover match (passes) + mismatch (throws)
- [ ] lint + vet clean

## Notes

- Consumed by the generate/refine endpoints (T11) **before** the stream opens — failures are normal JSON 422, not SSE error frames.
- Reuse `GateError`/`EstimateRevalidationFailedError` from `apps/api/src/lib/errors.ts` if a shared shape fits; else a thin motion-graphic-coded subclass.
