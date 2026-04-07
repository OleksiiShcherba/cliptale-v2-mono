---
name: interface used instead of type for hook result and state shapes
description: Hooks declare their result/state shapes with `interface` instead of `type`; this is a §9 violation for all non-Props shapes
type: project
---

In `useTrackReorder.ts` (flagged 2026-04-06), `TrackReorderState` and `UseTrackReorderResult` are declared as `interface`. These are domain/hook types, not React component prop shapes, so they must use the `type` keyword per §9.

**Why:** §9 is explicit: use `interface` ONLY for React component prop shapes suffixed with `Props`. All other types (domain types, hook return shapes, state shapes) must use `type`.

**How to apply:** In every hook file review, check that exported state and result shapes are declared with `type`, not `interface`. Only `*Props` interfaces are permitted.
