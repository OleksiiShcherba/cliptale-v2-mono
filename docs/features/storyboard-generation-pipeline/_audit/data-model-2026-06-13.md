# Data-model audit — storyboard-generation-pipeline (2026-06-13)

**Mode:** brownfield delta (one new table on the existing Step-2 storyboard subsystem).
**Owner:** Backend Lead. **Stage next:** `api storyboard-generation-pipeline`.

## Staged migrations (NOT in the live `migrations/` tree)

| Staged file | Promotes to | Statements |
|---|---|---|
| `docs/features/storyboard-generation-pipeline/migrations/01_create_storyboard_pipeline.up.sql` | `apps/api/src/db/migrations/057_storyboard_pipeline.sql` (number assigned at promote) | 1 × `CREATE TABLE IF NOT EXISTS` |
| `…/migrations/01_create_storyboard_pipeline.down.sql` | (manual rollback / down) | 1 × `DROP TABLE IF EXISTS` |

> **Migrations are staged — not yet in the live `migrations/` tree.** `implement` promotes them
> (assigning the real sequence number) when the `layer: migration` task runs.

## Promote-time convention hint

- Repo migration naming is **sequential** `NNN_description.sql`, in-process runner
  (`apps/api/src/db/migrate.ts`, gated by `APP_MIGRATE_ON_BOOT`), SHA-256 checksum-tracked.
- **The live tree is already at `056_add_truncated_to_cast_extraction_jobs.sql`** — so the
  **SAD §5 / §7 hint "056_storyboard_pipeline" is STALE**. Next free number ≈ **`057`**.
  `implement` assigns the real number at promote-time (another in-flight feature may grab 057
  first). This staleness is exactly why the migration is staged, not numbered now.
- Single-statement-per-file is **not** required here (MySQL in-process runner, not
  golang-migrate transaction-per-file) — but this migration is single-statement anyway.

## Convention deviations (deliberate, flagged per self-check #4)

1. **No partial-unique active-run index** (vs ADR-0007's "reuse the `active_lock` partial-unique
   idiom" of `045`/`055`). Rationale: that idiom (`UNIQUE(draft_id, block_id, active_lock)`)
   exists because those tables have **many rows per draft**. `storyboard_pipeline` has **PK =
   `draft_id`** → exactly one row per draft, so single-active-run is already guaranteed by the
   PK + the `version` CAS + the `active_run_phase IS NULL` claim check. Adding a partial-unique
   index on a singleton row would be redundant. Faithful simplification of ADR-0007, not a
   contradiction — the marker (`active_run_phase`) is kept; only the redundant index is dropped.
2. **Cost persisted on the state row, not a per-run history table** (ADR-0006 says "persist both
   estimate and actual per run"). The row holds the **current** expensive-phase run's
   `cost_estimate`/`actual_cost`; the estimate-vs-actual **delta KPI is emitted to telemetry at
   charge time** (§7 metric `cost_estimate_actual_delta_pct`), not stored as SQL history —
   consistent with ADR-0002 "no transition history kept" and SAD §11 accepted debt. If a durable
   per-run cost ledger is later required (e.g. for the deferred deduction, §11 OQ), an append-only
   side table can be added without touching the resume read path.

## Self-checks (4/4 pass)

1. **Naming matches repo convention** ✅ — `storyboard_pipeline`; snake_case columns; `CHAR(36)`
   ids; `DATETIME(3)` audit with `ON UPDATE CURRENT_TIMESTAMP(3)`; lowercase-snake ENUM values;
   `DECIMAL(10,4)` for credits (matches `aggregate_estimate_credits`); `INT UNSIGNED version`
   (matches `storyboard_reference_blocks`); `fk_`/`idx_` prefixes; `ENGINE=InnoDB DEFAULT
   CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`. All detected from migrations 037–055.
2. **Down reversibility** ✅ — one `CREATE TABLE` ↔ one `DROP TABLE IF EXISTS`.
3. **FK indexes** ✅ — the only FK is `draft_id → generation_drafts(id)`; `draft_id` is the PK
   (leftmost), which serves as the FK index. No uncovered FK.
4. **Convention adherence** ✅ — follows repo conventions; the two deliberate divergences above
   are flagged with rationale, not silently imposed.

## Drift detection

**N/A.** `storyboard_pipeline` is a brand-new table; no TS domain struct exists for it yet
(`storyboardPipeline.repository.ts` is created in `implement`). No existing table is altered, so
no field-vs-column drift is introduced. Drift between the new repository structs and this DDL
will be checked at `implement`/`review` time.

## Breaking-change decompositions

**None.** No `ALTER` on an existing table, no new NOT NULL on a populated table, no rename/drop.
Pure additive `CREATE TABLE` → no expand→backfill→contract needed.

## No-change findings (existing tables relied on, intentionally unaltered)

- ADR-0008 incremental re-trigger → reuses `storyboard_reference_blocks.window_status` (053) +
  `storyboard_scene_illustration_jobs.status` (038/039). **No DDL** — the "small extension" is
  application-level (read existing terminal statuses), not a column add.
- AC-09 reference-below-music → reuses `sort_order` on both reference and music block tables (053/045).
- AC-10/AC-11 references-feed / text-only → reuses `storyboard_reference_scene_links` (054) +
  `storyboard_reference_stars` (055) + `window_status='done'` as "Ready".

## Open `<!-- TBD -->` / deferred items

- **OQ-2 (deploy migration of in-flight drafts)** — drafts mid-old-flow with queued/running
  *Scene planning* / *Illustration status* jobs must be drained or one-time-seeded into a
  `storyboard_pipeline` row at cut-over. **Owner: Tech Lead, due before `sdd:tasks`** (spec §8,
  SAD §11 OQ). Not a schema concern — it is a one-time data migration / backfill script authored
  at `implement`/deploy time; default = drain or seed old jobs into the new state row. No DDL here.
- **Credit-deduction ownership (residual OQ-1)** — deferred to after the KPI window (~2026-07-12),
  SAD §11. The `cost_estimate`/`actual_cost` columns are designed now so the later deduction reads
  them (ADR-0006). No action this stage.

## Seeds

**None.** No bootstrap row, no lookup data — a draft's pipeline row is created lazily on the first
Step-2 open by the service, not seeded. Test fixtures are inline INSERTs (documented in
`data-model.md` §Test fixtures), never in `migrations/`. PII guard: user fixtures use `*@example.test`.
