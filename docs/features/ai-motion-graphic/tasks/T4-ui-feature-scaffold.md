---
id: T4
title: "Scaffold the motion-graphic web-editor feature slice + route + page shell"
layer: "ui"
deps: []
acs: ["AC-13"]
files_hint:
  - "apps/web-editor/src/features/motion-graphic/"
  - "apps/web-editor/src/main.tsx"
owner: "Frontend Lead"
estimate: "S"
status: "todo"
---

# T4 — Scaffold the motion-graphic feature slice + route

## Why

Every UI task lands in this slice; standing it up first unblocks T13/T14 to start in parallel. Derives from [sad §5](../sad.md) (feature decomposition, modelled on generate-wizard) + [spec US-01](../spec.md).

## What

Create `apps/web-editor/src/features/motion-graphic/` with the repo's slice shape: `api.ts`, `types.ts`, `components/`, `hooks/`, `runtime/` (placeholder). Mirror the wire types from [openapi.yaml](../contracts/openapi.yaml) in `types.ts` (camelCase). Register a protected `/motion-graphics` route in `main.tsx` (`createBrowserRouter`, `<ProtectedRoute>` wrapper, as `/generate` does) rendering an empty page shell.

## Definition of Done

- [ ] `features/motion-graphic/` slice exists with `api.ts`, `types.ts` (mirrors openapi schemas), `components/`, `hooks/`, `runtime/`
- [ ] `/motion-graphics` protected route registered in `main.tsx` and renders a page shell without errors
- [ ] Reuses the existing styling-token convention (`*.styles.ts`, App.styles.ts tokens) — no new styling system
- [ ] lint + typecheck clean

## Notes

- Model strictly on `features/generate-wizard/` (`api.ts` / `types.ts` / `components/` / `hooks/`).
- No data fetching beyond the empty shell — list rendering is T13.
