---
id: T20
title: "End-to-end + resume/authz regression coverage"
layer: "tests"
deps: ["T14", "T16", "T17", "T18", "T19", "T12", "T13"]
acs: ["AC-05", "AC-06", "AC-13"]
files_hint:
  - "apps/api/src/services/storyboardPipeline.e2e.test.ts"
  - "apps/web-editor/src/features/storyboard/__tests__/"
owner: "Backend + Frontend"
estimate: "M"
status: "todo"
---

# T20 — End-to-end + resume/authz regression coverage

## Why

The per-task tests prove each unit; this task proves the **whole journey** end-to-end and locks the cross-cutting behaviours that span surfaces — resume/observer convergence (AC-05), cancel + incremental re-trigger (AC-06), authz deny-and-hide (AC-13). Derives from [sad §10 quality tree](../sad.md), [spec §5](../spec.md).

## What

- Backend integration (real MySQL): full happy path AC-01→04 through the api + worker; close-mid-phase → reopen → same loader/modal (AC-05); a second "tab" read converges to the same state; cancel keeps partials and re-trigger enqueues only unfinished units (AC-06); a non-owner gets the opaque 404 on every operation (AC-13).
- Frontend e2e-through-UI: open Step 2 → loader → cast modal → confirm → reference loader → scene-image offer → accept → illustrated scenes; reload mid-phase reconstructs the screen.

## Definition of Done

- [ ] All flows green against real MySQL (`singleFork`); the e2e-through-UI happy path passes.
- [ ] Resume test: backend work is found to have continued while the page was closed.
- [ ] lint + vet clean.

## Notes

- Final gate before ship; depends on every surface being wired (T14) and rendered (T16–T19) plus scene-image (T12) and cost instrumentation (T13).
- Mind the E2E seed-user + 15-min login rate limit; run vitest from `apps/web-editor` for the UI tier.
