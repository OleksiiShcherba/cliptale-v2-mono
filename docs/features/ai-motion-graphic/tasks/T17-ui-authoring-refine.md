---
id: T17
title: "Authoring view — refine SSE flow + append-turn verdict persist (keep last working)"
layer: "ui"
deps: ["T16"]
acs: ["AC-03", "AC-14"]
files_hint:
  - "apps/web-editor/src/features/motion-graphic/components/"
  - "apps/web-editor/src/features/motion-graphic/hooks/"
owner: "Frontend Lead"
estimate: "M"
status: "todo"
---

# T17 — Authoring view: refine flow

## Why

The iterate half of the authoring loop, and the last-working-version guarantee on a bad refinement. Derives from [spec US-04, AC-03/AC-14](../spec.md) + [sad §6 flow 3](../sad.md).

## What

Extend the authoring view (T16): sending a refinement in the chat shows cost + confirm, opens the `POST /motion-graphics/{id}/refine` **SSE** stream (T11), runs transpile (T14) + determinism scan (T15) on the assembled code, then persists via `POST /motion-graphics/{id}/turns` (T10): `ready` → appends the exchange and refreshes the preview (AC-03); `failed` → records the error in chat and **keeps the last working preview/version unchanged** (AC-14). Reuses the SSE-consume + transpile/scan plumbing built in T16.

## Definition of Done

- [ ] A refinement appends the exchange to the persistent chat and refreshes the preview on `ready` (AC-03)
- [ ] A failed refinement records a plain-language error in chat and the previously working graphic stays current (AC-14)
- [ ] Chat history persists across reload (resumable, US-05)
- [ ] Component/hook tests pass; lint + typecheck clean

## Notes

- Depends on T16 (shares the same components/hooks files → serialized lane).
- Server keeps last-working on `failed` (T6/T10); the UI must not optimistically replace the preview before the verdict.
