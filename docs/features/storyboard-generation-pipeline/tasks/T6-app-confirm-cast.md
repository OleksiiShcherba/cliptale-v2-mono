---
id: T6
title: "Confirm-cast: create references below music, idempotent run claim"
layer: "app"
deps: ["T4", "T5"]
acs: ["AC-03", "AC-09", "AC-14"]
files_hint:
  - "apps/api/src/services/storyboardPipeline.confirm.service.ts"
owner: "Backend"
estimate: "M"
status: "todo"
---

# T6 — Confirm-cast: references below music, idempotent

## Why

Confirming the cast must create every reference block **below all music blocks** (AC-09), price-check server-side, start reference-image generation (AC-03), and be safe to repeat from a double-click or a second tab without duplicating blocks (AC-14). Derives from [openapi POST …/confirm-cast](../contracts/openapi.yaml), [Flow 6 (sad §6)](../sad.md), [ADR-0007](../adr/0007-single-active-run-via-active-run-marker-and-cas.md).

## What

`confirmCast(draftId, body?)`:
- guard: `reference_data` must be `awaiting_review` (else `pipeline.not_awaiting_review`);
- `revalidateEstimate` (T5) before any spend;
- claim the `reference_image` run via CAS — **if a run already exists, return the existing state (200), creating no blocks** (AC-14);
- on first claim, insert reference blocks at `sort_order > MAX(storyboard_music_blocks.sort_order)` for the draft (creation-time snapshot, AC-09) and enqueue reference-image generation (rolling window ≤ 4);
- the body is optional (confirm-as-shown) — see [openapi `CastConfirmation`](../contracts/openapi.yaml).

## Definition of Done

- [ ] Integration tests: confirm creates blocks ordered below every music block; a repeated confirm creates **0** duplicate blocks and returns the existing run (AC-14); confirm on a non-`awaiting_review` phase returns `pipeline.not_awaiting_review` (422).
- [ ] No spend occurs before `revalidateEstimate` passes.
- [ ] lint + vet clean.

## Notes

- Own service file → parallel with T7/T8.
- Reuses existing reference-block creation (`storyboardReference.blocks.service.ts`) + `sort_order` ((draft_id, sort_order) index already exists).
- Snapshot ordering only — does **not** re-order if music is added later (§11 accepted debt).
