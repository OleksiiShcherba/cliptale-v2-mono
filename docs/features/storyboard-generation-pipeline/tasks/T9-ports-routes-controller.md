---
id: T9
title: "Pipeline routes + controller (ownership-before-prerequisite, error codes)"
layer: "ports"
deps: ["T6", "T7", "T8"]
acs: ["AC-13"]
files_hint:
  - "apps/api/src/routes/storyboardPipeline.routes.ts"
  - "apps/api/src/controllers/storyboardPipeline.controller.ts"
  - "apps/api/src/lib/errors.ts"
owner: "Backend"
estimate: "M"
status: "todo"
---

# T9 — Pipeline routes + controller

## Why

The five operations need a single HTTP surface that validates input, **evaluates ownership before any prerequisite/order check** so a non-owner never learns a draft exists (AC-13), and maps the new gate codes to the repo's error envelope. Derives from [openapi.yaml](../contracts/openapi.yaml), [sad §8 (authorization)](../sad.md), [spec §6.1](../spec.md), [Cross-cutting flow (sad §6)](../sad.md).

## What

- `routes`: `GET /storyboards/:draftId/pipeline`, `POST …/confirm-cast`, `POST …/phases/:phase/trigger`, `POST …/phases/:phase/cancel`, `POST …/phases/:phase/skip` behind `authMiddleware` + `aclMiddleware('editor')`.
- `controller`: Zod-validate `draftId`/`phase`/body; **call `assertDraftOwner` first** → opaque `404` (`NotFoundOpaque`) for a non-owner or a missing draft, identical for every operation; only then delegate to the T4/T6/T7/T8 services.
- `lib/errors.ts`: add the new typed codes `pipeline.phase_out_of_order`, `pipeline.scenes_required`, `pipeline.not_awaiting_review`, `pipeline.estimate_revalidation_failed` (422 family, `{ error, code, details }`).

## Definition of Done

- [ ] Controller integration tests: a non-owner gets the **same opaque 404** for read/start/cancel/skip/confirm — even when a prerequisite is unmet (no prerequisite-specific leak, AC-13); each 422 returns its spec'd `code`.
- [ ] OpenAPI (`packages/api-contracts`) updated in the **same commit** (convention).
- [ ] lint + vet clean.

## Notes

- Joins T6/T7/T8 into the HTTP surface — single ports lane.
- Error envelope is the repo's `{ error }` + additive `{ error, code, details }` (api-sync-report deviation #1), **not** the SDD template's `{ code, message }`.
