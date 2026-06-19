---
id: T6
title: "motionGraphic.service — CRUD, ownership filtering, ready-state invariant"
layer: "app"
deps: ["T5"]
acs: ["AC-01", "AC-02", "AC-03", "AC-06", "AC-07", "AC-12", "AC-13", "AC-14"]
files_hint:
  - "apps/api/src/services/motionGraphic.service.ts"
owner: "Backend Lead"
estimate: "M"
status: "todo"
---

# T6 — motionGraphic.service (ownership + ready-state)

## Why

The service is the authorization + invariant boundary the controllers call. Derives from [spec §5 AC-01/02/03/06/07/12/13/14](../spec.md) + [sad §6 flows 3–6, §8](../sad.md).

## What

Add `apps/api/src/services/motionGraphic.service.ts` (modelled on `storyboard.service.ts` — ownership checked **before** anything else). Operations: `list`, `getWithChat`, `createFromVerdict` (Flow 1 persist), `rename`, `appendTurn` (Flow 3 persist), `duplicate` (Flow 6). Verdict mapping: `ready` → set/update `code` + bump `version` + status `ready`; `failed` → append failed assistant turn with `errorMessage`, **keep** last working code/version/ready-state (AC-06/AC-14). Duplicate seeds chat as live re-runnable turns + current code (AC-12). Every read/write owner-filtered; non-owner → `NotFoundError` (existence hiding, AC-07).

## Definition of Done

- [ ] Non-owner access to get/rename/turns/duplicate raises `NotFoundError` (indistinguishable from absent, AC-07) — unit-tested per operation
- [ ] `createFromVerdict`/`appendTurn` honor the ready/failed mapping (failed never overwrites the working version, AC-06/AC-14)
- [ ] `duplicate` produces an independent same-owner copy, chat seeded as live turns (AC-12)
- [ ] `list` returns owner-scoped summaries incl. the empty case (AC-13)
- [ ] Unit tests pass; lint + vet clean

## Notes

- Server is **not** authoritative for "does the code run" — that verdict arrives from the browser (`outcome`); the service trusts + records it (MVP1, ADR-0001/0004).
- Ready-state-for-attach (AC-08) is enforced at the attach endpoint (T12) using this service's read.
