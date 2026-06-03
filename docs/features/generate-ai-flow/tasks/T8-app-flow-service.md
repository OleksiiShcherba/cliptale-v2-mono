---
id: T8
title: "Implement generation-flow.service (CRUD, autosave, optimistic-lock conflict)"
layer: "app"
deps: ["T6"]
acs: ["AC-04", "AC-10", "AC-10b"]
files_hint: ["apps/api/src/services/generation-flow.service.ts"]
owner: "Backend Lead"
estimate: "M"
status: "todo"
---

# T8 — generation-flow.service

## Why

The use-case layer for flow lifecycle: enforces owner-scoping + existence-hiding, assembles the flow-open payload (canvas + per-block job states for reattach), and turns a stale-version save into the `OptimisticLockError` the controller maps to 409. Derives from [sad §8 Authorization / Existence-hiding / Error handling](../sad.md), [ADR-0003](../adr/0003-detect-concurrent-flow-saves-with-an-optimistic-version-column.md), [spec §AC-04/10/10b](../spec.md).

## What

`apps/api/src/services/generation-flow.service.ts`: `list`, `create`, `open` (returns canvas + `listByFlow` job states from T7), `rename`, `delete` (soft-delete the flow + soft-unlink its `flow_files`), `saveCanvas` (validate canvas via T4 schema, call T6 `saveCanvas`; zero-row → throw `OptimisticLockError`). Every method takes the caller `userId`; a flow not owned by the caller raises `NotFoundError` (never 403 — no existence disclosure).

## Definition of Done

- [ ] Non-owner and absent flow are indistinguishable — both → `NotFoundError`
- [ ] `open` returns the canvas plus each result block's last-known job state
- [ ] A stale-version `saveCanvas` raises `OptimisticLockError`; a matching one returns the new version
- [ ] `delete` soft-deletes the flow + its links and leaves library assets intact
- [ ] Unit + integration tests cover owner-scoping, the 409 path, and delete-preserves-assets; lint + vet clean

## Notes

Pairs with the flow CRUD controller (T14). Uses T6 (flow repo) + T7 (`listByFlow`).
