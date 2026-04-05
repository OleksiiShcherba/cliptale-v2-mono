---
name: Fixture file exported functions require JSDoc
description: .fixtures.ts exported functions require per-function JSDoc per §9; file-level block comment alone is not sufficient
type: project
---

Exported functions in `.fixtures.ts` files (e.g. `makeTrack`, `makeClip`, `makeProjectDoc`, `dispatchKey`) require individual JSDoc comments per §9 ("Write JSDoc on all exported functions and types"). A file-level block comment describing the purpose of the file does not satisfy the per-function requirement.

Exported constants (e.g. `QUEUED_JOB` in `ExportModal.fixtures.ts`) were not flagged — the rule applies specifically to exported functions.

**Why:** §9 is explicit: "all exported functions and types". Prior reviews applied this to `imageClipSchema` and `WaveformSvg`; fixture helper functions are no exception.
**How to apply:** Flag any exported function in a `.fixtures.ts` file that lacks a JSDoc comment — even if the function name is self-descriptive.
