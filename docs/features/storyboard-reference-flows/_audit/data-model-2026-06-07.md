# Audit — data-model — storyboard-reference-flows — 2026-06-07

## Staged migration files

Migrations are **staged** under `docs/features/storyboard-reference-flows/migrations/` — NOT yet in the live `apps/api/src/db/migrations/` tree. `implement` promotes them (assigns the real sequential numbers at promotion time, since another feature may promote first).

| Feature-local ordinal | File | Tables created |
|---|---|---|
| 01 | `01_create_storyboard_cast_extraction_jobs.up.sql` | `storyboard_cast_extraction_jobs` |
| 01 (rollback) | `01_create_storyboard_cast_extraction_jobs.down.sql` | `DROP TABLE IF EXISTS storyboard_cast_extraction_jobs` |
| 02 | `02_create_storyboard_reference_blocks.up.sql` | `storyboard_reference_blocks` |
| 02 (rollback) | `02_create_storyboard_reference_blocks.down.sql` | `DROP TABLE IF EXISTS storyboard_reference_blocks` |
| 03 | `03_create_storyboard_reference_scene_links.up.sql` | `storyboard_reference_scene_links` |
| 03 (rollback) | `03_create_storyboard_reference_scene_links.down.sql` | `DROP TABLE IF EXISTS storyboard_reference_scene_links` |
| 04 | `04_create_storyboard_reference_stars.up.sql` | `storyboard_reference_stars` |
| 04 (rollback) | `04_create_storyboard_reference_stars.down.sql` | `DROP TABLE IF EXISTS storyboard_reference_stars` |

**Promote-time convention hint:** repo uses sequential 3-digit numbers (`NNN_description.sql`); current last migration is `051_add_history_origin_preview.sql`. Next available ≈ `052`. `implement` assigns the real numbers (052, 053, 054, 055) at promotion, in ordinal order (01→02→03→04). Another feature promoting before this one shifts the numbers — assign at promotion, not now.

**Dependency order at promotion (must be respected):**
1. `01` (no inter-feature deps)
2. `02` (no inter-feature deps)
3. `03` (FKs into `02`)
4. `04` (FKs into `02`)

## Convention adherence

All detected conventions matched — no deviations:

| Convention | Detection source | Applied |
|---|---|---|
| Table naming: `snake_case`, domain-prefixed | existing migrations (e.g. `storyboard_music_blocks`) | ✓ `storyboard_reference_*`, `storyboard_cast_extraction_*` |
| PK: `id CHAR(36)` UUID v4 via `randomUUID()` | `storyboard_music_blocks.id`, `generation_flows.flow_id` | ✓ `id CHAR(36)` on all new tables (consistent with off-chain block precedent 045) |
| PK name: plain `id` for new off-chain blocks | `storyboard_music_blocks` (045) | ✓ using `id`, not `<table>_id` |
| FK to `ai_generation_jobs`: `VARCHAR(64)` | 014 reshape (BullMQ string IDs) | ✓ `first_job_id VARCHAR(64)` |
| Audit columns: `created_at DATETIME(3)` + `updated_at DATETIME(3) ON UPDATE` | 037, 045, 046 | ✓ on all tables (stars: `created_at` only — no `updated_at` needed, rows are insert/delete) |
| Soft deletes: `deleted_at` | used in `generation_flows`, `storyboard_blocks` | not used — reference stars/links have hard cascade semantics (AC-07/AC-10b) |
| `IF NOT EXISTS` guard | all existing migrations | ✓ |
| `InnoDB` + `utf8mb4_unicode_ci` | all existing migrations | ✓ |
| Manual rollback comment + `DROP TABLE IF EXISTS` | 045, 046, autosave-checkpoints | ✓ |

## Self-check results (all 4 mandatory checks)

| Check | Result |
|---|---|
| **Naming** matches repo convention | ✓ PASS — snake_case, domain-prefixed, `id` PK for off-chain blocks |
| **Down reversibility** — every CREATE has a DROP | ✓ PASS — 4 `.down.sql` files, each `DROP TABLE IF EXISTS` |
| **FK indexes** — every FK column has an index | ✓ PASS — see table below |
| **Convention adherence** — no silent style imposition | ✓ PASS — all decisions derived from architecture-map.md §Migrations + existing migrations |

### FK → Index coverage matrix

| Table | FK column | Index covering it |
|---|---|---|
| `storyboard_cast_extraction_jobs` | `draft_id` | `idx_storyboard_cast_extraction_draft_created (draft_id, created_at DESC)` |
| `storyboard_cast_extraction_jobs` | `user_id` | `idx_storyboard_cast_extraction_user (user_id)` |
| `storyboard_reference_blocks` | `draft_id` | `idx_storyboard_reference_blocks_draft_sort (draft_id, sort_order)` |
| `storyboard_reference_blocks` | `flow_id` | `uq_storyboard_reference_blocks_flow (flow_id)` |
| `storyboard_reference_blocks` | `first_job_id` | `idx_storyboard_reference_blocks_first_job (first_job_id)` |
| `storyboard_reference_scene_links` | `reference_block_id` | PK `(reference_block_id, scene_block_id)` — leading column |
| `storyboard_reference_scene_links` | `scene_block_id` | `idx_storyboard_reference_scene_links_scene (scene_block_id)` |
| `storyboard_reference_stars` | `reference_block_id` | `uq_storyboard_reference_stars_block_file (reference_block_id, file_id)` — leading column |
| `storyboard_reference_stars` | `file_id` | `idx_storyboard_reference_stars_file (file_id)` |

## Drift detection

No domain-layer structs/types exist yet for this feature (no `.ts` files in `apps/api/src/repositories/storyboardReference.*` — the feature is not implemented yet). Drift detection: N/A — no pre-existing domain layer to diff against. `implement` will create these files; run drift check post-implementation if needed.

## Breaking changes

All 4 migrations create new tables only — no alterations to existing tables. Zero downtime concern; no expand→backfill→contract steps required.

## Open `<!-- TBD -->` items

None — all column types, constraints, and indexes are fully resolved. The `proposal_json` schema (array shape) is documented in a code comment in the `.up.sql` but is owned by the application layer (Zod-validated, not DB-constrained — consistent with `storyboard_plan_jobs.plan_json` pattern in 037).

## Architecture-map.md staleness note

`architecture-map.md` states "000–045, 46 files" (reflects commit 9f943df, 2026-05-30) — the current live tree has 52 migrations (000–051). The map's §Migrations section is stale but the conventions it documents (3-digit sequential, in-process runner, `IF NOT EXISTS`) still hold. Re-run `sdd:survey` after this feature ships.

## Next stage

`/sdd:api storyboard-reference-flows`
