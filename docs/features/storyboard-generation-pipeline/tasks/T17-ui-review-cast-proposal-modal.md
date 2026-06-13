---
id: T17
title: "ReviewCastProposalModal (reuse CastConfirmModal)"
layer: "ui"
deps: ["T15"]
acs: ["AC-02", "AC-03", "AC-07"]
files_hint:
  - "apps/web-editor/src/features/storyboard/components/ReviewCastProposalModal.tsx"
owner: "Frontend"
estimate: "M"
status: "todo"
---

# T17 — ReviewCastProposalModal

## Why

When reference-data finishes, the Creator reviews the AI cast proposal — each reference with its selected scenes and the reference-image cost — then confirms (AC-03) or skips (AC-07) (AC-02 presents it). Derives from [spec §AC-02/03/07](../spec.md), [openapi `CastProposal`](../contracts/openapi.yaml), [Flow 1/4/6 (sad §6)](../sad.md).

## What

- Rendered when `reference_data` is `awaiting_review`; reads `payload.cast_proposal` + `cost_estimate` (T15);
- lists each proposed reference (`name`, `kind`, AI-selected `scene_ids`);
- **Confirm** → `confirmCast` (optional adjusted body); **Skip/dismiss** → `skipPhase('reference_data')`.

## Definition of Done

- [ ] Component tests: renders each proposed reference + its scenes + the cost estimate; confirm calls `confirmCast`; dismiss calls `skipPhase`.
- [ ] lint + vet clean.

## Notes

- **Reuse the existing `CastConfirmModal` / `ReferenceDetailsModal` primitives** (`components/CastConfirmModal.tsx`) and tokens — extend, do not hand-roll a new modal or styling system.
- `cast_proposal` shape derives from the inherited cast-extraction output (api-sync-report finding B1) — render defensively against `additionalProperties: true`.
- Parallel with T16/T18/T19.
