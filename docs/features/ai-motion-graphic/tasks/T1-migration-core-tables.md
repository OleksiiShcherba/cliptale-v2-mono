---
id: T1
title: "Promote + apply the three core Motion Graphic tables"
layer: "migration"
deps: []
acs: ["AC-01", "AC-12", "AC-13"]
files_hint:
  - "docs/features/ai-motion-graphic/migrations/01_create_motion_graphics.up.sql"
  - "docs/features/ai-motion-graphic/migrations/01_create_motion_graphics.down.sql"
  - "docs/features/ai-motion-graphic/migrations/02_create_motion_graphic_chat_turns.up.sql"
  - "docs/features/ai-motion-graphic/migrations/02_create_motion_graphic_chat_turns.down.sql"
  - "docs/features/ai-motion-graphic/migrations/03_create_motion_graphic_block_snapshots.up.sql"
  - "docs/features/ai-motion-graphic/migrations/03_create_motion_graphic_block_snapshots.down.sql"
owner: "Backend Lead"
estimate: "S"
status: "todo"
---

# T1 — Promote + apply the three core Motion Graphic tables

## Why

The three new tables are the persistence foundation for every downstream task. Derives from [data-model.md](../data-model.md) (`motion_graphics`, `motion_graphic_chat_turns`, `motion_graphic_block_snapshots`) + [ADR-0008](../adr/0008-single-store-mysql-code-as-text.md) + [ADR-0009](../adr/0009-separate-snapshot-table-for-code-backed-block-media.md).

## What

Promote the **staged** migrations `01_create_motion_graphics`, `02_create_motion_graphic_chat_turns`, `03_create_motion_graphic_block_snapshots` (`.up.sql` / `.down.sql` pairs under `docs/features/ai-motion-graphic/migrations/`) into the live `apps/api/src/db/migrations/` tree as the next numbers (≈ **058–060**, in promotion order). The in-process runner picks them up at startup. No code beyond the SQL.

## Definition of Done

- [ ] Staged 01/02/03 promoted to live `apps/api/src/db/migrations/` with the correct next numbers
- [ ] All three apply cleanly on a fresh boot (`IF NOT EXISTS` guards) and revert cleanly via their `.down.sql`
- [ ] `motion_graphics` has `idx_motion_graphics_user_active` + the `users` FK `ON DELETE CASCADE`; chat turns have `idx_mg_chat_turns_graphic_seq`; snapshots have `idx_mg_block_snapshots_source` + the source FK `ON DELETE SET NULL`
- [ ] lint + vet clean

## Notes

- `layer: migration` → `implement` serializes this lane; **T2** (the `04` pivot alter) depends on this task — it references `motion_graphic_block_snapshots`.
- Hard rule: UUID v4 `CHAR(36)`, `DATETIME(3)` audit cols, InnoDB/utf8mb4, soft-delete `deleted_at` — already in the staged SQL; promote verbatim, do not re-author.
