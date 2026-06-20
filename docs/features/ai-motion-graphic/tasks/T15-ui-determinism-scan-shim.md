---
id: T15
title: "Determinism enforcement — author-time AST scan + runtime shim"
layer: "ui"
deps: ["T14"]
acs: ["AC-09"]
files_hint:
  - "apps/web-editor/src/features/motion-graphic/runtime/"
owner: "Tech Lead"
estimate: "M"
status: "todo"
---

# T15 — Determinism AST scan + runtime shim

## Why

A ready graphic must animate only from its frame position so preview ↔ future export match frame-for-frame. Derives from [ADR-0006](../adr/0006-ast-scan-and-runtime-shim-for-determinism.md) + [spec AC-09, §6 NFR](../spec.md) + [sad §10 QG-1](../sad.md).

## What

Extend `runtime/`: a static **AST scan** that rejects `Date.now()` / `new Date()` / `Math.random()` / `performance.now()` (and any off-allowlist import) before a graphic can be reported `ready`, returning a precise plain-language reason; plus a **runtime shim** that freezes those sources during execution as a defense-in-depth backstop. The scan verdict feeds the browser's ready/failed decision (consumed by T16/T17).

## Definition of Done

- [ ] AST scan rejects each banned source with a precise reason; a `useCurrentFrame()`-only component passes (AC-09)
- [ ] Runtime shim freezes time/random sources during execution without breaking deterministic components
- [ ] A non-deterministic component never yields a `ready` verdict (surfaces as the "not usable" path, AC-06/AC-14)
- [ ] Unit tests cover deterministic-pass + each non-deterministic-reject case; lint + typecheck clean

## Notes

- Pairs with T20 (CI frame-diff parity on the fixture set) — per-graphic enforcement here, the cross-release parity backstop there. There is **no** per-user-graphic runtime frame-diff (spec §6 NFR).
- Shares `runtime/` with T14 → serialized; lands after T14.
