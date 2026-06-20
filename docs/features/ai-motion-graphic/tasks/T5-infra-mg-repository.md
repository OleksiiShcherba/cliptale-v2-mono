---
id: T5
title: "motionGraphic.repository — raw-SQL CRUD for graphics, chat turns, and block snapshots"
layer: "infra"
deps: ["T1", "T2"]
acs: ["AC-01", "AC-03", "AC-04", "AC-10", "AC-12", "AC-13", "AC-14"]
files_hint:
  - "apps/api/src/repositories/motionGraphic.repository.ts"
owner: "Backend Lead"
estimate: "M"
status: "todo"
---

# T5 — motionGraphic.repository (graphics, chat turns, snapshots)

## Why

The service layer (T6) and the attach endpoint (T12) need persistence primitives over the three tables. Derives from [data-model.md](../data-model.md) (entities + indexes) + [ADR-0008](../adr/0008-single-store-mysql-code-as-text.md) + [ADR-0009](../adr/0009-separate-snapshot-table-for-code-backed-block-media.md).

## What

Add `apps/api/src/repositories/motionGraphic.repository.ts` (raw `mysql2`, no ORM, module-singleton `pool`), modelled on `storyboard.repository.ts`. Functions: insert graphic; read-by-id joined with chat turns in `seq` order; list-by-owner cursor-paged newest-first (`deleted_at IS NULL`); update `code` + `version`; rename; append a chat turn with the next `seq`; bulk-copy chat turns for duplicate; and the **attach persistence** — an atomic insert of an immutable `motion_graphic_block_snapshots` row + a `storyboard_block_media` row (`media_type='motion_graphic'`, `file_id=NULL`, snapshot FK set), plus the snapshot-join read. No authorization/error logic (that is the service).

## Definition of Done

- [ ] All functions execute against **real MySQL** (Vitest integration, `singleFork: true`, `*@example.test` users)
- [ ] List uses `idx_motion_graphics_user_active` with `{ items, nextCursor }` paging; chat read uses `idx_mg_chat_turns_graphic_seq`; append assigns a monotonic `seq`
- [ ] Duplicate copy preserves `seq` order + each assistant turn's `generated_code` (AC-12)
- [ ] Snapshot + block-media insert run in one transaction; the snapshot is a **copy** — mutating the source afterward leaves it byte-identical (AC-04/AC-10)
- [ ] lint + vet clean

## Notes

- Ready-state gating + ownership live in the **service** (T6) / attach **endpoint** (T12), not here.
- Use the data-model §Test fixtures factories (`makeMotionGraphic`, `makeChatTurn`, `makeBlockSnapshot`).
