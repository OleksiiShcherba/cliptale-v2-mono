---
id: T1
title: "Create the storyboard_pipeline state table (staged migration)"
layer: "migration"
deps: []
acs: ["AC-05", "AC-07", "AC-12", "AC-14"]
files_hint:
  - "docs/features/storyboard-generation-pipeline/migrations/01_create_storyboard_pipeline.up.sql"
  - "docs/features/storyboard-generation-pipeline/migrations/01_create_storyboard_pipeline.down.sql"
owner: "Tech Lead"
estimate: "S"
status: "todo"
---

# T1 — Create the storyboard_pipeline state table (staged migration)

## Why

The single server-authoritative pipeline-state row is the substrate for resume (AC-05), the `skipped`≠`idle` distinction (AC-07), stuck-release (AC-12) and single-active-run (AC-14). Derives from [data-model §storyboard_pipeline](../data-model.md), [ADR-0002](../adr/0002-single-pipeline-state-row-per-draft.md), [sad §7](../sad.md).

## What

Promote the **staged** migration pair under `docs/features/.../migrations/01_create_storyboard_pipeline.{up,down}.sql` (already drafted by `data-model`) into the live runner. Verify it matches the data-model exactly: `draft_id` PK + FK `generation_drafts(id)` ON DELETE CASCADE; `active_phase` ENUM(4); four `*_status` ENUM(7); `active_run_phase` nullable ENUM(4); `payload_json` JSON; `version` INT UNSIGNED; `phase_started_at` / `heartbeat_at` DATETIME(3); `cost_estimate` / `actual_cost` DECIMAL(10,4); `error_message` VARCHAR(512); audit columns; and `idx_storyboard_pipeline_active_heartbeat (active_run_phase, heartbeat_at)`.

## Definition of Done

- [ ] Staged `01_*.up.sql` / `01_*.down.sql` promote into the live `apps/api/src/db/migrations/` sequence as **`057_create_storyboard_pipeline.sql`** (live `056` is already taken).
- [ ] Migration applies and reverts cleanly against real MySQL (`down` drops the table + index).
- [ ] Column types, ENUM value sets and the index match [data-model.md](../data-model.md) field-for-field.
- [ ] lint + vet clean.

## Notes

- **Numbering:** the live tree already has `056_add_truncated_to_cast_extraction_jobs.sql`; the SAD's "056" reference is stale — promote to **057**.
- Migration layer is serialized by `implement`; no other migration in this epic.
- No existing table is altered (data-model §No-change findings) — per-unit state stays in `window_status` / `storyboard_scene_illustration_jobs.status`.
