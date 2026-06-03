---
id: T19
title: "Build useFlowAutosave (version-aware, 409 conflict warning)"
layer: "ui"
deps: ["T16", "T14"]
acs: ["AC-10b"]
files_hint: ["apps/web-editor/src/features/generate-ai-flow/hooks/useFlowAutosave.ts"]
owner: "Frontend Lead"
estimate: "M"
status: "todo"
---

# T19 — useFlowAutosave (version-aware)

## Why

Edits persist automatically, but two tabs editing the same flow must not silently clobber each other — a conflicting save is rejected and the Creator is told to reload (first save authoritative). Derives from [spec §AC-10/10b + §6 NFR (autosave ack ≤800 ms)](../spec.md), [sad §6 Flow 4 / §8 Error handling](../sad.md), [ADR-0003](../adr/0003-detect-concurrent-flow-saves-with-an-optimistic-version-column.md).

## What

`hooks/useFlowAutosave.ts`: debounce canvas changes and `PUT .../canvas` carrying the **parent version**; on 200, adopt the returned new version; on **409**, surface a conflict warning that asks the Creator to reload (the other tab's save stays authoritative — never overwrite). Mirrors the storyboard autosave shape but version-aware (the deliberate divergence from blind-overwrite, ADR-0003).

## Definition of Done

- [ ] A debounced save carries the current parent version and adopts the new one on success
- [ ] A 409 surfaces the reload-to-continue warning without overwriting; the first save stays authoritative
- [ ] Autosave ack target ≤800 ms is met under a typical flow
- [ ] Hook tests cover the version-bump success and the conflict path; lint + typecheck clean

## Notes

Depends on T16 (api) + T14 (canvas-save endpoint + 409). No undo/redo or version snapshots in v1 (spec §8 resolved; sad §11 accepted debt) — autosave + this conflict warning is the whole history story.
