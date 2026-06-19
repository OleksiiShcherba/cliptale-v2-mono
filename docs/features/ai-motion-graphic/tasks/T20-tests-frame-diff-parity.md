---
id: T20
title: "CI frame-diff parity on the fixed fixture set + determinism enforcement E2E"
layer: "tests"
deps: ["T15"]
acs: ["AC-09"]
files_hint:
  - "apps/web-editor/src/features/motion-graphic/runtime/__tests__/"
owner: "Tech Lead"
estimate: "M"
status: "todo"
---

# T20 — CI frame-diff parity + determinism E2E

## Why

Render parity is the headline quality goal — verified by a CI frame-diff on a fixed fixture set, with no per-user-graphic runtime frame-diff. Derives from [spec §6 NFR "Render parity", AC-09](../spec.md) + [sad §10 QG-1](../sad.md) + [ADR-0006](../adr/0006-ast-scan-and-runtime-shim-for-determinism.md).

## What

Add a CI **frame-diff** check that renders a **fixed fixture set** of deterministic graphics and asserts frame parity (the parity backstop across releases), plus an **end-to-end** assertion that a non-deterministic graphic never reaches `ready` state (exercising the T15 AST scan + shim through the authoring path).

## Definition of Done

- [ ] CI frame-diff renders the fixed fixture set and asserts parity (spec §6 NFR Render parity) — green on the deterministic fixtures
- [ ] An E2E case proves a time/random-driven graphic is blocked from `ready` (AC-09)
- [ ] **No** per-user-graphic runtime frame-diff is introduced (fixture-set only, per the NFR)
- [ ] Runs in CI; lint + vet clean

## Notes

- Depends on T15 (the enforcement under test). The fixture set is the parity contract — keep it small and stable.
- This is the cross-release backstop; per-graphic determinism is enforced author-time in T15.
