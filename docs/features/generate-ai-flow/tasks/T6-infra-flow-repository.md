---
id: T6
title: "Implement generation-flow.repository (CRUD + optimistic-version save)"
layer: "infra"
deps: ["T1", "T4"]
acs: ["AC-04", "AC-10", "AC-10b"]
files_hint: ["apps/api/src/repositories/generation-flow.repository.ts"]
owner: "Backend Lead"
estimate: "M"
status: "todo"
---

# T6 — generation-flow.repository

## Why

The persistence boundary for the flow aggregate: owner-scoped reads/writes, full-canvas restore, and the optimistic-lock save that protects concurrent edits. Derives from [data-model.md §generation_flows + Indexes](../data-model.md), [ADR-0002](../adr/0002-persist-flow-canvas-as-a-single-json-document-column.md), [ADR-0003](../adr/0003-detect-concurrent-flow-saves-with-an-optimistic-version-column.md), [spec §AC-04/10/10b](../spec.md). Follows the repo convention (`mysql2` raw parameterized SQL, no ORM, `pool` singleton).

## What

`apps/api/src/repositories/generation-flow.repository.ts`: `create`, `getById` (owner-filtered), `listByUser` (cursor + `WHERE user_id=? AND deleted_at IS NULL ORDER BY updated_at DESC`, served by `idx_generation_flows_user_active_updated`), `rename`, `softDelete`, and `saveCanvas(flowId, userId, parentVersion, canvas)` — a single UPDATE guarded by `WHERE version = parentVersion` that increments `version`; a zero-row result signals a version conflict to the service. Canvas in/out is validated by the T4 `FlowCanvas` schema at the service boundary, stored as JSON here.

## Definition of Done

- [ ] CRUD methods are owner-scoped (every query carries `user_id` and `deleted_at IS NULL`)
- [ ] `saveCanvas` increments `version` only on a matching parent version; a mismatch returns the zero-row signal (no write)
- [ ] `listByUser` orders most-recent-first and pages by cursor
- [ ] Integration tests against real MySQL cover create/read/list/rename/soft-delete + the matching-vs-stale save paths
- [ ] lint + vet clean

## Notes

Depends on T1 (table) + T4 (canvas schema). The 409 *mapping* lives in the service (T8); this layer only reports the row count. Open-flow latency (≤1500 ms) rides the composite index from T1.
