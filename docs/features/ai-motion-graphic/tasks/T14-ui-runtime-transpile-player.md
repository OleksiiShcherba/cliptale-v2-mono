---
id: T14
title: "Browser runtime — in-browser transpile (Sucrase) + mount authored TSX into <Player>"
layer: "ui"
deps: ["T4"]
acs: ["AC-02"]
files_hint:
  - "apps/web-editor/src/features/motion-graphic/runtime/"
owner: "Frontend Lead"
estimate: "M"
status: "todo"
---

# T14 — Browser runtime: transpile + <Player> mount

## Why

The central runtime pillar — AI-authored TSX must execute in the browser preview. Derives from [ADR-0004](../adr/0004-transpile-in-browser-and-mount-authored-component.md) + [sad §5 runtime/, §10 QG-3](../sad.md) + [spec AC-02, §6 NFR](../spec.md).

## What

Build `features/motion-graphic/runtime/`: transpile authored TSX with a **Sucrase-class** transpiler (not a full Babel pass — the ≤1500 ms budget), then dynamically mount the resulting component into a runtime composition wrapper fed to Remotion's `<Player>` (reuse the `PreviewPanel` Player pattern + pinned `@remotion/player` 4.0.443). Render a full-canvas live preview region (AC-02). A transpile/mount failure yields a clean "fails to run" verdict for the caller (T16).

## Definition of Done

- [ ] A fixture authored component transpiles + mounts into `<Player>` and renders a full-canvas preview (AC-02)
- [ ] Transpile + runtime init stays within the ≤1500 ms p95 budget on the fixture set
- [ ] A non-compiling / throwing component yields a clean "fails to run" verdict (no broken preview), feeding the AC-06 path
- [ ] Smoke test mounts the fixture; lint + typecheck clean

## Notes

- **Determinism enforcement (AST scan + shim) is T15** — keep this to transpile + mount + preview.
- The runtime lives in the feature slice (`runtime/`), **not** `packages/remotion-comps` (sad §5) — MVP1 is browser-only.
