# Data-model audit — reference-generation-autostart (2026-06-11)

**Mode:** brownfield delta. **Schema delta: NONE.**

## Headline

This feature is **persistence-neutral**. No entity, column, index, or migration is added. The lone backend change (ADR-0001 — idempotent `startExtraction`) is a service-layer read-then-conditional-insert fully served by the existing schema. `data-model.md` documents the reused entity for traceability and records the zero-delta conclusion.

## Conventions derived (read-only; no rules file written)

- **DB / access:** MySQL 8 / InnoDB via `mysql2` raw parameterized SQL, no ORM (architecture-map §Persistence).
- **Migrations:** numbered `NNN_description.sql` in `apps/api/src/db/migrations/`; in-process runner gated by `APP_MIGRATE_ON_BOOT`; new migration = next number; `IF NOT EXISTS` guards.
- **Promote-time number hint:** repo is sequential; live tree runs to **`056`**, so the next number would be **`057`** — **but this feature stages no migration, so `implement` has nothing to promote.** (Note: architecture-map §Migrations says `000–045`/46 files — **stale**; live tree is `000–056`. Drift flagged, not corrected here.)
- **PK / audit / delete conventions:** CHAR(36) UUID PKs; `created_at`/`updated_at` DATETIME(3) audit columns; ENUM status. The reused table follows all of these.

## Staged migrations

**None.** `docs/features/reference-generation-autostart/migrations/` is intentionally empty — nothing to stage. The architecture-map number hint (`057`) is recorded above for completeness only.

## Why no schema change (decision trail)

- ADR-0001 chose **service-level idempotency** (Option 3), explicitly **not** a DB `UNIQUE(draft_id)` constraint.
- A unique constraint would be **wrong** here: migration `052` documents "multiple rows per draft are allowed (failed-then-retry)", and the dedup semantic is "return latest **non-failed** job" — a partial-uniqueness MySQL cannot express as a simple constraint.
- The sad §6 persist-hint ("latest-extraction lookup keys on `draft_id`") is **already satisfied** by `idx_storyboard_cast_extraction_draft_created (draft_id, created_at DESC)` (migration `052`). Adding a `draft_id`-only index = redundant "just in case" index (anti-pattern). **Not added.**

## Drift findings

**Zero drift.** Domain type `CastExtractionJob` (`storyboardReference.repository.ts:20`) maps 1:1 to all 12 columns (incl. `truncated` from `056`). The `findLatestCastExtractionJobForDraft` query (`:163`) — `WHERE draft_id = ? AND user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1` — matches the composite index leading column. No `_drift/*.sql` produced.

## Breaking-change decompositions

None — no DDL.

## Open `<!-- TBD -->`

None.

## Self-check

All 4 mandatory self-checks pass (3 are N/A because no object is created — see `data-model.md` §Self-check). Mermaid `erDiagram` validated by structural lint (valid `||--o{` cardinality glyphs + `type name` attribute lines; `mmdc` not installed).

## Carried forward

- **`api` stage:** reflect `StartExtractionResult.status` literal `'queued'` → union `queued | running | completed` in `contracts/openapi.yaml` (ADR-0001 §Consequences). No request field added; no schema change.

**Next stage:** `/sdd:api reference-generation-autostart`
