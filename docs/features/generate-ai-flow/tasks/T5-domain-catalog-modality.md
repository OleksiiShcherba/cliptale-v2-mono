---
id: T5
title: "Extend model catalog with modality + exclusiveGroup and backfill every model"
layer: "domain"
deps: []
acs: ["AC-02", "AC-06", "AC-07"]
files_hint: ["packages/api-contracts/src"]
owner: "Backend Lead"
estimate: "M"
status: "todo"
---

# T5 — Catalog modality + exclusiveGroup + backfill

## Why

Typed connections and the "exactly one of" rule must read from one data-driven source so both the canvas (connect-time block, AC-02; handle reconciliation, AC-07) and the API (Generate-time validation, AC-06) agree. The catalog today carries neither. Derives from [ADR-0006](../adr/0006-declare-modality-and-exclusivity-groups-in-the-model-catalog-schema.md), [data-model.md §Catalog schema extension](../data-model.md), [spec §AC-02/06/07](../spec.md).

## What

In `packages/api-contracts` (`FalFieldSchema` + the catalog): add optional `modality?: 'text'|'image'|'audio'|'video'` and `exclusiveGroup?: string`. Backfill `modality` per field `type` (`text`→text; `image_url`/`image_url_list`→image; `audio_url`/`audio_upload`→audio; video is an output modality). Replace the hardcoded runtime XOR by tagging the `kling/o3` `prompt`/`multi_prompt` fields with `exclusiveGroup: 'prompt_mode'`. Surface both new fields in the `/ai/models` contract types.

## Definition of Done

- [ ] `modality` + `exclusiveGroup` added as optional schema fields; existing model consumers still type-check
- [ ] Every catalog field has a `modality` (or an explicit null where it is not a connectable input)
- [ ] The kling/o3 prompt⊕multi_prompt XOR is expressed via `exclusiveGroup` (and the prior `fal-models.test.ts` "XOR enforced by BE, not schema" expectation is updated)
- [ ] Unit tests assert modality + group for representative models per provider
- [ ] lint + vet clean

## Notes

No DB migration — the catalog is TypeScript/Zod (no catalog table). This is the single source both the UI (T17) and the server gate (T11) read.
