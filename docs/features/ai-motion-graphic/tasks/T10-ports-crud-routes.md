---
id: T10
title: "Motion Graphic CRUD routes + controller (list, get, create, rename, turns, duplicate)"
layer: "ports"
deps: ["T6"]
acs: ["AC-01", "AC-02", "AC-03", "AC-06", "AC-07", "AC-12", "AC-13", "AC-14"]
files_hint:
  - "apps/api/src/routes/motionGraphic.routes.ts"
  - "apps/api/src/controllers/motionGraphic.controller.ts"
  - "apps/api/src/index.ts"
owner: "Backend Lead"
estimate: "M"
status: "todo"
---

# T10 — Motion Graphic CRUD routes + controller

## Why

The non-streaming HTTP surface the web-editor reads/writes. Derives from [openapi.yaml](../contracts/openapi.yaml) (`/motion-graphics` GET/POST, `/{id}` GET/PATCH, `/{id}/turns` POST, `/{id}/duplicate` POST) + [sad §6 flows 1,3,4,5,6](../sad.md).

## What

Add `motionGraphic.routes.ts` + `motionGraphic.controller.ts` (thin HTTP adapter, `next(err)`), modelled on `storyboard.routes.ts`/`controller.ts`. Wire the middleware chain (auth → Zod body validation → controller). Implement the six operations against `motionGraphic.service` (T6). Mount the router in `index.ts`. Keep the hand-maintained OpenAPI in sync in the same commit.

## Definition of Done

- [ ] All six operations behave per openapi.yaml (camelCase keys, `{ items, nextCursor }` paging, `{ error, code?, details? }` envelope)
- [ ] Non-owner / absent → `404 motion_graphic.not_found`, indistinguishable (AC-07); Zod failures → `400`
- [ ] `POST /motion-graphics` records ready/failed verdict (AC-01/AC-06); `POST /{id}/turns` maps ready→update+version / failed→keep working (AC-03/AC-14); `/{id}/duplicate` returns the independent copy (AC-12); `GET` returns code+chat (AC-02); list owner-scoped (AC-13)
- [ ] Integration tests assert each AC outcome; lint + vet clean

## Notes

- Shares `motionGraphic.routes.ts` + `index.ts` with T11 → serialized lane; this task lands first and mounts the router.
- The SSE generate/refine endpoints are **T11**; the storyboard attach endpoint is **T12** (different file).
