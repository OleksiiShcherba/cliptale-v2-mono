# Data-model audit — storyboard-status-block-actions

> Date 2026-05-30 · Stage `data-model` · Mode greenfield-default · Owner Backend Lead

## Outcome: N/A — no data model, no migrations

This feature is **frontend-only and introduces no persistent state**. No `data-model.md` entities,
no staged migrations, no indexes. `data-model.md` records the N/A decision with full citations.

## Why (cited)

- **spec §6.1** — no new data, no new fields; Hide state is session-only, not persisted.
- **spec §3** — persisting hidden state is an explicit non-goal.
- **sad §1 / §2** — "frontend-only … no new backend, no new data"; "No backend, no datastore, no migration."
- **sad §6 closing flag** — explicitly tells `data-model` there is no new entity to index; the only
  persist note (illustration files retained) belongs to the **existing** backend.
- There is **no sad §6.4 ER stub** and **no entity in spec §5 ACs** — the ACs describe client-side
  behaviour only (menu render, owner gate, confirm dialog, session-only hide).

## Convention source (recorded for any future persistence work)

From `architecture-map.md` §Migrations / §Conventions / §Datastores — **not applied this stage** (nothing to migrate):
- Stack: TypeScript/Node + **MySQL 8 / InnoDB via `mysql2` raw SQL** (no ORM).
- PK: **UUID v4 stored as `CHAR(36)`** (`randomUUID()`), not auto-increment.
- Delete: soft-delete via `deleted_at`.
- Migrations: numbered `NNN_description.sql` in `apps/api/src/db/migrations/` (live tree currently `000`–`045`),
  in-process runner gated by `APP_MIGRATE_ON_BOOT`, DDL guarded with `IF NOT EXISTS`.

## Process note (error caught and corrected)

A first pass mistakenly invented two tables (`storyboard_blocks`, `block_action_logs`) and staged
**Laravel PHP** migrations — wrong on two counts: (1) the feature persists nothing, and (2) the repo
is `mysql2` raw-SQL, not Laravel. Both the fabricated entities and the staged migration files were
removed before completion. No files were written into the live `migrations/` tree at any point.

## Staged migrations

None.

## Promote-time hint

None — nothing to promote.

## Drift findings

N/A — no new domain entities to map against the existing domain layer.

## Self-check (4/4, trivially)

1. **Naming** — no schema produced; nothing to name. ✓
2. **Down reversibility** — no migrations; nothing to reverse. ✓
3. **FK indexes** — no FKs introduced. ✓
4. **Convention adherence** — no schema imposed; repo conventions recorded for future use, none violated. ✓

## Next stage

`/sdd:api storyboard-status-block-actions` — likewise expected to be light/N/A (no new server interface;
Regenerate reuses existing generation-start endpoints, per sad §3 and ADR-0001).
