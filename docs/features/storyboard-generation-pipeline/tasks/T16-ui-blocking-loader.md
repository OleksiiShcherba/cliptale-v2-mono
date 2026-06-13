---
id: T16
title: "BlockingLoader component (full-screen, labelled, cancel)"
layer: "ui"
deps: ["T15"]
acs: ["AC-01", "AC-06", "AC-12"]
files_hint:
  - "apps/web-editor/src/features/storyboard/components/BlockingLoader.tsx"
  - "apps/web-editor/src/features/storyboard/components/BlockingLoader.styles.ts"
owner: "Frontend"
estimate: "S"
status: "todo"
---

# T16 — BlockingLoader component

## Why

Every running phase shows a full-screen blocking loader the Creator can cancel from under, and it must release the instant the backend reports `failed`/`idle` (AC-01 scene loader, AC-06 cancel, AC-12 stuck-release). Derives from [spec §AC-01/06/12](../spec.md), [Flow 1/2/3 (sad §6)](../sad.md).

## What

- A full-screen overlay rendered when the active phase is `running`, showing `payload.loader_label`;
- a cancel control wired to `cancelPhase(activePhase)` (T15);
- released (unmounted) when the state becomes `failed` (show `error_message` + retry, AC-12) or `idle` (AC-06).

## Definition of Done

- [ ] Component tests: renders the loader label; cancel calls `cancelPhase`; the overlay is released on `failed`/`idle` and surfaces the failure message + retry on `failed`.
- [ ] lint + vet clean.

## Notes

- Reuse the existing full-screen overlay pattern/tokens (`CheckpointCaptureOverlay.styles.ts`) and the repo's `*.styles.ts` inline-CSSProperties convention — do **not** introduce a new styling system.
- Parallel with T17/T18/T19 (all depend only on T15).
