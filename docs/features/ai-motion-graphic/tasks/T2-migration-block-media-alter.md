---
id: T2
title: "Promote + apply the storyboard_block_media alter"
layer: "migration"
deps: ["T1"]
acs: ["AC-04", "AC-10"]
files_hint:
  - "docs/features/ai-motion-graphic/migrations/04_alter_storyboard_block_media_motion_graphic.up.sql"
  - "docs/features/ai-motion-graphic/migrations/04_alter_storyboard_block_media_motion_graphic.down.sql"
owner: "Backend Lead"
estimate: "S"
status: "todo"
---

# T2 — Promote + apply the storyboard_block_media alter

## Why

A Motion Graphic attaches to a block as a frozen snapshot, not a file — the existing pivot must gain the new kind + a snapshot reference and relax its `file_id NOT NULL`. Derives from [data-model.md §storyboard_block_media](../data-model.md) + [ADR-0009](../adr/0009-separate-snapshot-table-for-code-backed-block-media.md).

## What

Promote the **staged** `04_alter_storyboard_block_media_motion_graphic` (`.up.sql` / `.down.sql`) into the live `apps/api/src/db/migrations/` tree as the next number (≈ **061**). The alter adds `motion_graphic` to the `media_type` ENUM, adds the nullable `motion_graphic_snapshot_id` FK → `motion_graphic_block_snapshots(id)` `ON DELETE CASCADE` + its index, and relaxes `file_id` to NULLABLE (expand-only, no backfill).

## Definition of Done

- [ ] Staged `04` promoted to live `migrations/` (≈ 061)
- [ ] Applies cleanly with existing `storyboard_block_media` rows intact (existing `image`/`video`/`audio` rows + their `file_id` unaffected)
- [ ] Reverts cleanly via `.down.sql`; `idx_storyboard_block_media_mg_snapshot` present; existing `idx_storyboard_block_media_block_id` (033) untouched
- [ ] lint + vet clean

## Notes

- Depends on T1: the new FK targets `motion_graphic_block_snapshots` (staged `03`).
- The "exactly one of `file_id` / `motion_graphic_snapshot_id` non-null" rule is an **application-level** invariant (service layer), **not** a DB `CHECK` — the repo uses no `CHECK` constraints (audit report). Do not add one.
- Touches an existing critical table; promote the staged SQL verbatim.
