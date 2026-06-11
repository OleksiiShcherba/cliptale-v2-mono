---
id: T7
title: "Frontend UI regression — no stray buttons, no duplicate, consent preserved"
layer: tests
deps: ["T6"]
acs: ["AC-02", "AC-04", "AC-05"]
files_hint:
  - "apps/web-editor/src/features/storyboard/components/StoryboardPage.test.tsx"
  - "apps/web-editor/src/features/storyboard/components/CastConfirmModal.test.tsx"
owner: "Oleksii (Storyboard squad)"
estimate: "S"
status: "todo"
---

# T7 — Frontend UI regression

## Why

The two headline quality goals ([sad §10](../sad.md) QG-2, QG-3) need end-to-end-through-UI proof: the stray-buttons defect can no longer occur in **any** state (AC-02), repeated Step-2 entries never spawn a second extraction (AC-05), and the single consent gate survives the refactor (AC-04). Unit tests on individual pieces aren't enough — this asserts the wired behavior.

## What

Through `StoryboardPage` (with `useCastAutostart` mounted and the refactored `CastConfirmModal`):
- Assert **0 stray-buttons** across every modal state (no-extraction, in-progress, proposal-ready, completed-empty, failed) — each renders inside the dialog wrapper (AC-02 / QG-2).
- Assert a re-mount / repeated entry on a draft with an existing extraction issues **no** second `startCastExtraction` (AC-05) — complements the backend QG-3 test (T2) at the UI seam.
- Assert the confirm path still calls `confirmCast` only from proposal-ready and only on explicit confirm — credits-consent gate unchanged (AC-04).

## Definition of Done

- [ ] Regression test enumerates all modal states and asserts none renders top-level loose buttons (AC-02).
- [ ] Repeated-entry test asserts a single extraction start across re-mounts (AC-05).
- [ ] Confirm-gate test asserts `confirmCast` fires only from proposal-ready on explicit confirm (AC-04).
- [ ] vitest (from `apps/web-editor`) passes; no new type errors in changed files.

## Notes

- Final task; depends on the full wiring (T6). Pairs with T2 (backend) for the "0 duplicates" NFR across both seams.
- Latency NFRs (QG-1 ≤500 ms, modal first-paint ≤150 ms) are RUM/front-end-timing measurements (spec §6), not asserted here — design property is enforced by T5's single cached existence query.
