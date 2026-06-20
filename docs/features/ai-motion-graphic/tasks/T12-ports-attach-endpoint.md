---
id: T12
title: "Attach-to-block endpoint — server-authored frozen snapshot"
layer: "ports"
deps: ["T5", "T6"]
acs: ["AC-04", "AC-07", "AC-08", "AC-10"]
files_hint:
  - "apps/api/src/routes/storyboard.routes.ts"
  - "apps/api/src/controllers/storyboard.controller.ts"
owner: "Backend Lead"
estimate: "M"
status: "todo"
---

# T12 — Attach-to-block endpoint

## Why

The snapshot must be server-frozen, so it cannot go through the opaque client-driven storyboard PUT. Derives from [openapi.yaml](../contracts/openapi.yaml) (`POST /storyboards/{draftId}/blocks/{blockId}/media/motion-graphic`) + [spec AC-04/07/08/10](../spec.md) + [sad §6 flow 2](../sad.md) + [ADR-0009](../adr/0009-separate-snapshot-table-for-code-backed-block-media.md).

## What

Add the attach endpoint to the existing `storyboard.routes.ts` + controller. Read the graphic via `motionGraphic.service` (T6) (owner → `404`, AC-07); enforce ready-state (`generating`/`failed` → `422 motion_graphic.not_ready`, AC-08); on `ready`, call the T5 attach persistence to write the frozen snapshot + block-media row and return `BlockMediaMotionGraphic` (201). The snapshot is a copy, never a reference (AC-10).

## Definition of Done

- [ ] Ready graphic → 201 with the frozen snapshot + `mediaType: motion_graphic`, `fileId: null` (AC-04)
- [ ] Non-ready → `422 motion_graphic.not_ready` with `details.status` (AC-08); non-owner/absent graphic or block → `404` indistinguishable (AC-07)
- [ ] A later source refine does not alter the placed instance (AC-10) — integration-tested
- [ ] OpenAPI in sync; lint + vet clean

## Notes

- Lives on the **storyboard** routes/controller (existing files), not `motionGraphic.routes.ts` — parallelizes with T10/T11.
- Enforce the application-level "exactly one of file_id / snapshot_id" invariant here (no DB CHECK, per data-model).
