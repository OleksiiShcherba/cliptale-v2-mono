# Data-model audit — ai-motion-graphic (2026-06-19)

**Owner:** Backend Lead · **Size:** L · **Mode:** brownfield delta (extends existing `storyboard_block_media`).

## Staged migrations (NOT in the live tree)

Migrations are **staged** under `docs/features/ai-motion-graphic/migrations/` — nothing was written into
`apps/api/src/db/migrations/`. `implement` promotes them when the feature is built.

| Ordinal | File | Up / Down |
|---|---|---|
| 01 | `01_create_motion_graphics` | ✅ / ✅ |
| 02 | `02_create_motion_graphic_chat_turns` | ✅ / ✅ |
| 03 | `03_create_motion_graphic_block_snapshots` | ✅ / ✅ |
| 04 | `04_alter_storyboard_block_media_motion_graphic` | ✅ / ✅ |

**Promote order is significant:** 01 → 02 (FK to motion_graphics) → 03 (FK to motion_graphics) → 04 (FK to
motion_graphic_block_snapshots). Down order is the reverse (04 → 03 → 02 → 01).

## Promote-time number hint

The repo numbers migrations sequentially `NNN_description.sql`; the live tree ends at **057** (`057_storyboard_pipeline.sql`).
Next ≈ **058, 059, 060, 061** for ordinals 01–04 — but `implement` assigns the **real** numbers at promote-time
in ordinal order, since another in-flight feature may promote first. The SAD §2 hint "next = 058" matches.

## Conventions detected & followed (from `apps/api/src/db/migrations/`)

| Topic | Repo convention | Applied |
|---|---|---|
| PK | UUID v4 `CHAR(36)`, app-generated (`randomUUID()`) | ✅ all new PKs |
| Audit | `created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)`; `updated_at … ON UPDATE` | ✅ (append-only tables omit `updated_at` by design) |
| Delete | soft-delete `deleted_at DATETIME(3) NULL` (precedent `generation_flows` 046) | ✅ on `motion_graphics` (root); children are CASCADE |
| Status/kind | `ENUM(...)` (precedent 057 status enums, 033 media_type) | ✅ `status`, `role`, `outcome`, `media_type` |
| App-owned shape | `JSON` (precedent `user_settings.settings_json` 050) | ✅ `props_schema` |
| Money/decimal | `DECIMAL(10,4)` for cost (057) | `DECIMAL(6,2)` for `duration_seconds` (seconds, not money) |
| FK | named `fk_<table>_<ref>`, `ON DELETE CASCADE` | ✅ (one deliberate SET NULL — see deviations) |
| Index | named `idx_<table>_<purpose>`; leading FK column doubles as FK index | ✅ |
| Idempotency | `CREATE TABLE IF NOT EXISTS`; ALTER via INFORMATION_SCHEMA + PREPARE/EXECUTE (026/048/056) | ✅ |
| Charset | `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci` | ✅ |
| No `CHECK` | repo uses no `CHECK` constraints | ✅ none added (see deviations) |

## Self-checks (4/4 pass)

1. **Naming** — ✅ snake_case tables/columns, `fk_*`/`idx_*` naming matches 033/046/050/057.
2. **Down reversibility** — ✅ every `CREATE TABLE`→`DROP TABLE`; `ADD COLUMN`→`DROP COLUMN`; `CREATE INDEX`→`DROP INDEX`; ENUM-expand and `file_id` NULL-relax both reversed in 04 down.
3. **FK indexes** — ✅ all 4 new FKs are covered: `user_id`/`motion_graphic_id` by leading composite columns, `source_motion_graphic_id` and `motion_graphic_snapshot_id` by dedicated indexes. The pre-existing `file_id` FK keeps its auto-index (re-created when 04 drops/re-adds the FK).
4. **Convention adherence** — ✅ follows repo conventions; deliberate deviations flagged below.

## Deliberate deviations (flagged, not silent)

- **`ON DELETE SET NULL` on `fk_mg_block_snapshots_source`** — the repo norm is `ON DELETE CASCADE`. Chosen deliberately because a placed instance is a **frozen snapshot independent of its source** (AC-10): deleting the source graphic must **not** destroy instances already placed on storyboard blocks. Hence `source_motion_graphic_id` is nullable.
- **Polymorphic invariant left to the app layer (no DB `CHECK`)** — exactly one of `storyboard_block_media.file_id` / `motion_graphic_snapshot_id` is non-null, keyed by `media_type`. The repo uses no `CHECK` constraints, so this is enforced in the service layer (consistent with the convention), not by the DB.
- **No `updated_at` on `motion_graphic_chat_turns` / `motion_graphic_block_snapshots`** — both are append-only / immutable by design (chat history is never edited; a snapshot is frozen, AC-10). Matches the repo's append-only job/event tables.

## Breaking-change decomposition (migration 04)

The ADR-0009 consequence (relax `storyboard_block_media.file_id` NOT NULL → NULL, add `motion_graphic` ENUM
value + snapshot FK) is **expand-only — no backfill, no contract step**. Every change is backward-compatible:
the new ENUM value is additive; relaxing NOT NULL touches no existing rows (image/video/audio rows keep their
populated `file_id`); the new column is nullable and unused by existing kinds. Old and new code coexist safely,
so the classic expand→backfill→contract is unnecessary (nothing existing is narrowed or dropped).

## Seeds

- **Bootstrap:** none — no lookup/reference data for this feature.
- **Lookup:** none.
- **Test fixtures:** factory functions documented in `data-model.md` §Test fixtures (Vitest integration against
  real MySQL; PII guard `example.test` only). NOT in `migrations/`.

## Drift detection

Not run as a separate pass — the feature's three tables are **new** (no existing domain structs to map). The one
existing table touched (`storyboard_block_media`, migration 033) is extended additively; its current shape was read
directly from the live migration and matched. No `_drift/` fixes generated.

## Open / TBD

- None blocking. The props-schema **shape** is intentionally untyped `JSON` in MVP1 (spec §2 goal 3 — validation/forms are MVP2); no `<!-- TBD -->` left in the model.
- Duration granularity confirmed with owner (2026-06-19): `DECIMAL(6,2)` fractional seconds. Delete strategy confirmed: soft-delete + per-turn `generated_code`.

**Status:** migrations are staged — not yet in the live `migrations/` tree; `implement` promotes them.
**Next stage:** `/sdd:api ai-motion-graphic`.
