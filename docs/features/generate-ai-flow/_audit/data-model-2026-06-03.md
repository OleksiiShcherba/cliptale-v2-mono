# Data-model audit — generate-ai-flow (2026-06-03)

**Stage:** `sdd:data-model` · **Owner:** Backend Lead · **Size:** L
**Inputs:** `spec.md` §5, `sad.md` §4/§6/§8 + Accepted ADRs 0001–0007, live `apps/api/src/db/migrations/` (`architecture-map.md` @ `reflects_commit 9f943df`).

## Staging notice

> **Migrations are STAGED — not in the live `migrations/` tree.** They live under
> `docs/features/generate-ai-flow/migrations/` with feature-local ordinals. `implement`
> **promotes** them into `apps/api/src/db/migrations/` (assigning the real sequence number,
> in ordinal order) when the `layer: migration` task runs. A stray `migrate up` cannot apply
> a half-designed schema.

| Staged file | Promotes to (hint) | Kind |
|---|---|---|
| `migrations/01_create_generation_flows.up.sql` / `.down.sql` | `046_*` | new table |
| `migrations/02_create_flow_files.up.sql` / `.down.sql` | `047_*` | new pivot table |
| `migrations/03_add_flow_columns_to_ai_generation_jobs.up.sql` / `.down.sql` | `048_*` | ALTER (2 cols + 1 index) |

**Promote-time number hint:** the repo is **sequential**, last live = `045`; next ≈ **`046`**.
`implement` assigns real numbers at promotion (in ordinal order, `01`→`046`, `02`→`047`, `03`→`048`) —
another in-flight feature may grab a number first, so the final values are decided then, not now.
Promote order matters: `02` FK-references `01`, so `01` must promote first.

## Convention deviations (flagged, not silently imposed)

1. **PK named `flow_id`, not `id`.** The repo is split — `files`/`projects`/`ai_generation_jobs`
   use `<entity>_id`; `generation_drafts`/`storyboard_blocks` use `id`. Chose `flow_id` so the
   `flow_files.flow_id` pivot FK reads cleanly and matches the `files`/`projects` family. No
   functional impact; flagged for reviewer awareness.
2. **Owner column `user_id`, not `owner_user_id`.** `projects` uses `owner_user_id` (added late,
   migration 020); the closer peer `generation_drafts` (user-owned JSON doc) uses `user_id`.
   Chose `user_id` to match the closer peer and the `files`/`ai_generation_jobs` family.
3. **`DATETIME(3)` audit columns + `version`/`deleted_at`** follow the modern tables
   (`files` 021, `ai_generation_jobs`) rather than `generation_drafts`/`storyboard_blocks`'
   plain `TIMESTAMP`. Deliberate — millisecond precision + the `deleted_at` index convention (029).

## Open question resolved (spec §8, due before `sdd:data-model`)

**OQ:** *Does the model catalog already declare alternative-input exclusivity groups (AC-06), or
must that schema be added?* → **RESOLVED: must be added.**

- The catalog `FalFieldSchema` (`packages/api-contracts/src/fal-models.ts`) carries **no `modality`
  and no `exclusiveGroup`**; the only XOR (`kling/o3` `prompt` ⊕ `multi_prompt`) is JSDoc + runtime
  ("enforced at submit time", confirmed by `fal-models.test.ts`).
- **ADR-0006 materialized:** add `modality?: 'text'|'image'|'audio'|'video'` and
  `exclusiveGroup?: string` to `FalFieldSchema`. See `data-model.md` § Catalog schema extension.
- **No migration emitted** — the catalog is TypeScript/Zod in `packages/api-contracts` (no DB table).
  The schema change + per-model backfill is an `implement` code task; it surfaces as contract types
  in `sdd:api`. Recorded so the OQ is closed and the field names are fixed.

## Breaking-change decompositions

None. The only change to a populated table (`ai_generation_jobs`) is **purely additive** — two
nullable columns + one index, no NOT NULL, no rename, no drop. No expand→backfill→contract needed.
New tables (`generation_flows`, `flow_files`) touch no existing data.

## Drift findings

None. The two new tables have no pre-existing domain layer to diff against; the `ai_generation_jobs`
change is additive and matches the established `draft_id` link pattern. No `_drift/` fixes generated.

## Self-check (4/4 pass)

- **Naming** ✅ (3 deliberate deviations flagged above).
- **Down reversibility** ✅ — every `.up` has a matching `.down`.
- **FK indexes** ✅ — `fk_generation_flows_user`→leading `user_id`; `fk_flow_files_flow`→PK lead
  `flow_id`; `fk_flow_files_file`→`idx_flow_files_file`. New `ai_generation_jobs` back-links carry
  no FK by design (orphan-safe, per migration 026's `draft_id` reasoning).
- **Convention adherence** ✅ — idempotent DDL (`IF NOT EXISTS` for tables; `INFORMATION_SCHEMA`
  + `PREPARE/EXECUTE` for the ALTER, matching 026/029); InnoDB / utf8mb4_unicode_ci; staged only.

## Outstanding `<!-- TBD -->`

None.

## Next stage

`/sdd:api generate-ai-flow` — derive the OpenAPI contract from `data-model.md` (typed fields +
constraints) + `sad.md` §6 sequences. Note: the §11 cost-estimate OQ is **due before `sdd:api`**.
