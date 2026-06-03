---
id: T18
title: "Build Inspector + content input (text/upload/library pick) + optional-parameter editing"
layer: "ui"
deps: ["T17"]
acs: ["AC-16"]
files_hint: ["apps/web-editor/src/features/generate-ai-flow/components/Inspector.tsx", "apps/web-editor/src/features/generate-ai-flow/components"]
owner: "Frontend Lead"
estimate: "M"
status: "todo"
---

# T18 — Inspector + content input + parameters

## Why

Content goes into blocks and optional model parameters go into a side inspector — so the Creator controls exactly what a generation receives without cluttering the canvas. Derives from [spec §US-04 / §AC-16](../spec.md), [sad §6 Flow 4](../sad.md).

## What

- Content blocks accept: typed text, a file upload (presigned S3), or a pick from the existing **library asset picker** (reuse the `asset-manager` picker, not a new one).
- `components/Inspector.tsx`: a side panel editing the selected generation block's **optional** model parameters (driven by the catalog field schema — required inputs are handles on the node, optional ones are inspector fields).
- Supplied content + parameter values persist on the blocks (into the canvas state) and feed the next Generate.

## Definition of Done

- [ ] Text / upload / library-pick all populate a content block and persist on it
- [ ] The inspector edits a generation block's optional params and retains them
- [ ] The retained content + params are the values used on the next Generate
- [ ] Component tests cover each content source + param-edit retention; lint + typecheck clean

## Notes

Depends on T17 (nodes + canvas state). Reuse the existing library picker + upload flow — do not build a new asset picker. Persistence to the server is the autosave hook (T19); this task only updates canvas state.
