---
id: T1
title: "Stage migration 046 — create generation_flows (owner-scoped, JSON canvas, version, soft-delete)"
layer: "migration"
deps: []
acs: ["AC-04", "AC-10"]
files_hint: ["docs/features/generate-ai-flow/migrations/01_create_generation_flows.up.sql", "docs/features/generate-ai-flow/migrations/01_create_generation_flows.down.sql"]
owner: "Backend Lead"
estimate: "S"
status: "todo"
---

# T1 — Stage migration 046: create generation_flows

## Why

The owner-scoped, soft-deletable flow aggregate that persists the whole canvas as one JSON document plus an optimistic version. Derives from [data-model.md §generation_flows](../data-model.md), [sad §5 / ADR-0002](../adr/0002-persist-flow-canvas-as-a-single-json-document-column.md), [ADR-0003](../adr/0003-detect-concurrent-flow-saves-with-an-optimistic-version-column.md). Enables owner-scoping (AC-04) and full-canvas restore (AC-10).

## What

The **staged** pair already present under `docs/features/generate-ai-flow/migrations/01_create_generation_flows.up.sql` / `.down.sql`. Promote to live `apps/api/src/db/migrations/046_generation_flows.sql` (next after 045). Columns per data-model: `flow_id` PK CHAR(36), `user_id` FK→users CASCADE, `title` default `'Untitled flow'`, `canvas` JSON, `version` INT UNSIGNED default 1, `created_at`/`updated_at` DATETIME(3), `deleted_at` nullable; plus `idx_generation_flows_user_active_updated (user_id, deleted_at, updated_at DESC)`. `IF NOT EXISTS`-guarded, InnoDB / utf8mb4_unicode_ci.

## Definition of Done

- [ ] Staged 01 up/down promote to live `046_*` and apply cleanly against MySQL 8
- [ ] `.down` drops the table; up→down→up is clean
- [ ] `idx_generation_flows_user_active_updated` exists and leads with `user_id` (covers the FK + the Flow-3 list query)
- [ ] lint + vet clean

## Notes

Migration layer is serialized by `implement` (ordered 046/047/048). Do **not** write into the live `migrations/` tree from elsewhere — the staged file is the source. PK named `flow_id` (not `id`) is a deliberate divergence flagged in the data-model self-check.
