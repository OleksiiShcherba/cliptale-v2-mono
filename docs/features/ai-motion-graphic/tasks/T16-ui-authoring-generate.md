---
id: T16
title: "Authoring view — duration input, generate SSE flow, create-verdict persist"
layer: "ui"
deps: ["T11", "T14", "T15", "T10"]
acs: ["AC-01", "AC-02", "AC-05", "AC-06"]
files_hint:
  - "apps/web-editor/src/features/motion-graphic/components/"
  - "apps/web-editor/src/features/motion-graphic/hooks/"
owner: "Frontend Lead"
estimate: "M"
status: "todo"
---

# T16 — Authoring view: generate flow

## Why

The first half of the core authoring loop: describe → stream → preview → persist a new graphic. Derives from [spec US-02/03, AC-01/02/05/06](../spec.md) + [sad §6 flow 1](../sad.md).

## What

Build the authoring view layout: the **animation-duration (seconds) input above the chat**, the full-canvas live preview alongside (T14), and the chat panel. On submit of a description, show the cost estimate + confirm, open the `POST /motion-graphics/generate` **SSE** stream (T11), assemble the streamed code, run transpile (T14) + determinism scan (T15), then persist the verdict via `POST /motion-graphics` (T10): `ready` → preview refreshes + ready with an auto-title sized to the chosen duration (AC-01); `failed` (won't run or non-deterministic) → record the error in chat, no broken preview (AC-06). Surface the AC-05 too-short message inline from the server 422 `description_too_short`.

## Definition of Done

- [ ] Duration input renders above the chat; preview fills the canvas area alongside (AC-02)
- [ ] Generate persists a new graphic sized to the chosen duration with an auto-title (AC-01)
- [ ] A failed generate records a plain-language error in chat and shows no broken preview (AC-06)
- [ ] Too-short / empty description surfaces the server's `description_too_short` message (AC-05)
- [ ] Component/hook tests pass; SSE consumption handles `token`/`done`/`error` frames; lint + typecheck clean

## Notes

- **Refine** (AC-03/AC-14) is the sibling task **T17**, building on this view's SSE+persist plumbing.
- The cost-confirm UI shows the estimate before opening the stream; the server gate is T7/T11 (AC-11).
