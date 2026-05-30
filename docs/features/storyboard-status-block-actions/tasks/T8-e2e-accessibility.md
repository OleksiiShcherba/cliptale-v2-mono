---
id: T8
title: "E2E + accessibility checks for Regenerate safety and keyboard operability"
layer: "tests"
deps: ["T6"]
acs: ["AC-01", "AC-05", "AC-09"]
files_hint:
  - "apps/web-editor/e2e"
owner: "Frontend Eng"
estimate: "M"
status: "todo"
---

# T8 — E2E + accessibility checks

## Why

The spec §6 NFRs require E2E proof that the destructive warning always precedes regeneration and that the menu is keyboard-reachable/operable. Derives from [spec §6 NFR (Destructive-action safety, Accessibility)](../spec.md) and [sad §10 QG-1, QG-2](../sad.md).

## What

Add E2E coverage under `apps/web-editor/e2e/`:

- **QG-1 destructive safety (AC-01, AC-05):** triggering scene Regenerate always shows the loss-enumerating warning *before* any overwrite; confirming runs the regeneration (same in-progress UI as a first run); cancelling leaves scenes, illustrations, and music untouched.
- **QG-2 accessibility:** the completed-block status menu is reachable and operable by keyboard only (focus → activate → Escape) with no axe violations on the menu/modal.
- **AC-09:** for a signed-in non-owner viewer, the kebab status menu is absent from the DOM on the completed blocks.

## Definition of Done

- [ ] E2E asserts the warning precedes scene regeneration and cancel is a no-op (QG-1 / AC-01 / AC-05).
- [ ] Keyboard-nav + axe check pass on the menu and confirm modal (QG-2).
- [ ] Non-owner DOM has no kebab on completed blocks (AC-09).
- [ ] Suite passes in CI.

## Notes

- Use the existing `e2e/seed-test-user.sql` seeding approach and `*@example.test` identities; seed a second non-owner user for the AC-09 case.
- Menu open-latency (≤100 ms, QG-3) is **non-gating** per spec §6 — do not add a CI pass/fail timing assertion for it.
