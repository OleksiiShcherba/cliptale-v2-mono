---
id: T11
title: "Generation + refinement SSE endpoints (POST /generate, POST /{id}/refine)"
layer: "ports"
deps: ["T9", "T6", "T10"]
acs: ["AC-05", "AC-11"]
files_hint:
  - "apps/api/src/routes/motionGraphic.routes.ts"
  - "apps/api/src/controllers/motionGraphic.controller.ts"
owner: "Backend Lead"
estimate: "M"
status: "todo"
---

# T11 — Generation + refinement SSE endpoints

## Why

The streaming authoring surface — the only `text/event-stream` endpoints in the api. Derives from [openapi.yaml](../contracts/openapi.yaml) (`/motion-graphics/generate`, `/motion-graphics/{id}/refine`) + [ADR-0003](../adr/0003-server-sent-events-for-generation-streaming.md) + [sad §6 flows 1 & 3](../sad.md).

## What

Add the two authoring endpoints to `motionGraphic.routes.ts` + controller. They call `motionGraphicAuthoring.service` (T9); `/refine` first reads the graphic via `motionGraphic.service` (T6) with the owner check (→ 404). Pre-stream gate failures (length → `422 description_too_short` for generate; cost → `422 estimate_revalidation_failed`; guardrail → `422 prompt_rejected`) return **JSON 4xx** before the stream opens. On pass, set SSE headers and relay the `token`/`done`/`error` frames. No row is written.

## Definition of Done

- [ ] Each pre-stream 422 mode returns the correct `code` as JSON before any stream byte (AC-05 generate-only, AC-11 both)
- [ ] `/refine` returns `404` for non-owner/absent (AC-07) before streaming
- [ ] On pass, response is `text/event-stream` relaying ordered `token` frames + terminating `done`; mid-stream failure emits `error`
- [ ] Integration tests cover each 422 mode + a happy stream; OpenAPI in sync; lint + vet clean

## Notes

- Shares `motionGraphic.routes.ts` with T10 → serialized; depends on T10 mounting the router.
- Each stream holds a request slot + an upstream Anthropic stream (sad §7 SSE-capacity note) — clean up on client disconnect.
