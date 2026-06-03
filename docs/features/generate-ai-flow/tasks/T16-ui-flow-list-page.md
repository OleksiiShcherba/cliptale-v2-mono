---
id: T16
title: "Build FlowListPage + flow api.ts + /generate-ai route (create/rename/delete/open)"
layer: "ui"
deps: ["T14"]
acs: ["AC-04"]
files_hint: ["apps/web-editor/src/features/generate-ai-flow/components/FlowListPage.tsx", "apps/web-editor/src/features/generate-ai-flow/api.ts", "apps/web-editor/src/features/generate-ai-flow/types.ts", "apps/web-editor/src/main.tsx"]
owner: "Frontend Lead"
estimate: "M"
status: "todo"
---

# T16 — FlowListPage + api.ts + /generate-ai route

## Why

The Generate AI page entry point: list the Creator's flows and let them create/rename/delete/open. Derives from [spec §US-01 / §AC-04](../spec.md), [sad §6 Flow 3](../sad.md), [openapi.yaml /generation-flows](../contracts/openapi.yaml).

## What

A new `apps/web-editor/src/features/generate-ai-flow/` module (modelled on `generate-wizard`): `api.ts` (TanStack Query hooks over the flow endpoints), `types.ts`, and `components/FlowListPage.tsx` rendering owned flows most-recent-first with create / rename / delete / open actions. Add the `/generate-ai` route in `main.tsx`. **Reuse** existing list / button / modal primitives + `docs/design-guide.md` tokens (plain `CSSProperties` in co-located `*.styles.ts`) — list a new component only where no existing primitive fits.

## Definition of Done

- [ ] `/generate-ai` renders the Creator's flows, most-recent-first, paged by cursor
- [ ] Create / rename / delete / open work against the flow api
- [ ] Reuses existing primitives + design tokens (no new styling system)
- [ ] Component tests cover the list render + each CRUD action
- [ ] lint + typecheck clean (run vitest from `apps/web-editor`)

## Notes

Depends on T14 (flow CRUD endpoints). This is the shell the canvas (T17) mounts into. Owner-scoping is server-enforced — the UI only ever shows the caller's own flows.
