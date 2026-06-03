---
id: T14
title: "Add flow CRUD controller + routes (list/create/get/rename/delete/canvas-save) + OpenAPI"
layer: "ports"
deps: ["T8"]
acs: ["AC-04", "AC-08b", "AC-10", "AC-19"]
files_hint: ["apps/api/src/controllers/generation-flow.controller.ts", "apps/api/src/routes/generation-flows.routes.ts", "apps/api/src/index.ts", "packages/api-contracts/src"]
owner: "Backend Lead"
estimate: "M"
status: "todo"
---

# T14 — flow CRUD controller + routes

## Why

The HTTP surface for the flow resource: Zod-validate, owner-check, map typed errors, and expose the six flow endpoints the canvas + list page consume. Derives from [openapi.yaml /generation-flows + /{flowId} + /canvas](../contracts/openapi.yaml), [sad §5 / §8 Authorization / Error handling](../sad.md), [spec §AC-04/08b/10/19](../spec.md).

## What

- `apps/api/src/controllers/generation-flow.controller.ts`: handlers for `GET /generation-flows` (cursor+limit), `POST /generation-flows`, `GET /generation-flows/:flowId` (canvas + job states), `PATCH .../:flowId` (rename), `DELETE .../:flowId` (soft, 204), `PUT .../:flowId/canvas` (version-aware save). Zod request validation; the caller `userId` from auth; map `NotFoundError`→404, `OptimisticLockError`→409, `ValidationError`→400 via the central handler.
- `apps/api/src/routes/generation-flows.routes.ts` registered in `index.ts` after auth middleware.
- Update the hand-maintained OpenAPI in `packages/api-contracts` in the **same commit** (repo convention).

## Definition of Done

- [ ] All six endpoints exist with Zod validation + owner check
- [ ] Non-owner/absent → 404 (existence hiding); stale canvas save → 409
- [ ] Routes registered after middleware in `index.ts`; OpenAPI updated same commit
- [ ] Controller tests cover each outcome incl. the 404 + 409 paths
- [ ] lint + vet clean

## Notes

Depends on T8 (service). Wire-shape (camelCase keys, `{ error, code, details }` envelope, cursor pagination) follows the existing repo conventions noted in [api-sync-report.md](../contracts/api-sync-report.md) — do not introduce the bare SDD envelope or `/api/v1` prefix.
