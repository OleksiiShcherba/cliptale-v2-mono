---
id: T22
title: "E2E — assemble→connect→generate→library, reload restore, reattach, two-tab conflict"
layer: "tests"
deps: ["T18", "T19", "T20"]
acs: ["AC-01", "AC-08b", "AC-10", "AC-10b"]
files_hint: ["apps/web-editor/e2e/generate-ai-flow.spec.ts"]
owner: "QA"
estimate: "M"
status: "todo"
---

# T22 — E2E full-flow + durability

## Why

Prove the Creator's end-to-end journey through the real UI: build a flow, generate, see the result in the block and the library, and confirm durability across reload, async tab-close, and concurrent saves. Derives from [spec §US-01..07 + §AC-01/08b/10/10b](../spec.md), [sad §10 QG-3 (How verify)](../sad.md).

## What

A Playwright spec in `apps/web-editor/e2e/generate-ai-flow.spec.ts`:
- **Happy path (AC-01):** create a flow → add a text content block + an image-generation block → draw a typed connection → press Generate → confirm cost → result block shows the produced image and the asset appears in the general library.
- **Restore (AC-10):** reload the flow → canvas, connections, params, and prior results restore.
- **Reattach (AC-08b):** start a generation, navigate away, return → the result block reattaches / shows last-known outcome.
- **Conflict (AC-10b):** open the same flow in two tabs, save both → the second is rejected with the reload warning.

## Definition of Done

- [ ] All four scenarios pass in CI against a running stack
- [ ] Uses the E2E seed user; respects the 15-min login rate limit (reuse the auth session, don't re-login per test)
- [ ] Real data entry, clicks, drag-to-connect, and a screenshot assertion on the dominant result preview
- [ ] Green in CI

## Notes

Depends on the full UI (T18 + T19 + T20). The happy path exercises a real paid generation against the configured provider/sandbox — coordinate the test model + cost with the team. This is the playwright-reviewer / E2E tier, distinct from the backend integration suite (T21).
