# Active Task

## Task
**Name:** EPIC 9 / Ticket 1 — [DB] [REWORK] Replace `ai_provider_configs` and Reshape `ai_generation_jobs` for fal.ai
**Source:** `docs/general_tasks.md` lines 275–309 (within EPIC 9 — Unified AI Generation Layer (fal.ai), REWORK)
**Goal:** After this task, a fresh `docker compose up` (with an empty `db_data` volume) results in: (a) the `ai_provider_configs` table no longer existing in the schema, and (b) the `ai_generation_jobs` table reshaped to drop `provider` + `type` and add `model_id VARCHAR(128) NOT NULL` + `capability ENUM(...) NOT NULL`, with all other columns (`prompt`, `options`, `status`, `progress`, `result_url`, `result_asset_id`, `error_message`, timestamps) preserved exactly as-is. Both new migrations have integration tests in the `migration-008.test.ts` style.

---

## Context

### Why this task matters
EPIC 9 was originally implemented as a "bring your own API key" multi-provider integration (8 providers, encrypted per-user key storage). That entire approach has been rejected. The new product model uses fal.ai as the single server-side integration (one `APP_FAL_KEY` owned by us) and exposes only models — never providers — to the user. This task is **the destructive groundwork**: it tears the old DB shape apart so the rest of the rework (key teardown, fal client, model catalog, service rework, worker rework, FE rework) lands on a clean schema. It is the first ticket in the rework build order and is a prerequisite for every BE ticket downstream. This is a pre-launch dev DB; preserving existing rows is explicitly out of scope.

### Relevant architecture constraints
- **Migration files are auto-applied only on first boot of an empty `db_data` volume** (`apps/api/src/db/migrations/` is mounted to MySQL's `/docker-entrypoint-initdb.d`). To pick up new migrations on an existing volume, the dev must run `docker compose down -v && docker compose up`. This is documented in `docs/architecture-rules.md` §Database migrations.
- **Migration files use `CREATE TABLE IF NOT EXISTS`** and must be safe to re-run (idempotent). New migrations in this task must follow the same idempotency rule (use `DROP TABLE IF EXISTS`, guard `ALTER`s with information_schema checks where needed).
- **Numbered SQL files** in `apps/api/src/db/migrations/`. Next available numbers are `013` and `014`.
- **MySQL 8.0 / InnoDB** — supports `ALTER TABLE … DROP COLUMN` and `ADD COLUMN` directly; FK constraints on the table do not need to be dropped to alter unrelated columns.
- **Docker Compose dev workflow only** — per project memory `project_dev_workflow.md`. All testing of these migrations happens via `docker compose`, not bare `localhost`.
- **Tests live alongside migrations** in `apps/api/src/__tests__/integration/`, following the `migration-008.test.ts` + `migration-008.fixtures.ts` pattern: load the SQL file with `readFileSync`, execute via mysql2 with `multipleStatements: true`, then assert against `information_schema`. Tests use a real MySQL connection (not mocked).
- **Naming**: SQL files use snake_case with leading 3-digit number; integration test files mirror the migration name (e.g. `migration-013.test.ts`).

### Related areas of the codebase
- `apps/api/src/db/migrations/009_ai_provider_configs.sql` — creates the table that this task drops. **Do not edit** — drop it via a forward migration so the history is intact.
- `apps/api/src/db/migrations/010_ai_generation_jobs.sql` — current `ai_generation_jobs` shape with `provider` ENUM + `type` ENUM. **Do not edit** — reshape forward.
- `apps/api/src/db/migrations/011_seed_dev_user.sql` — already clean (only inserts the dev user). **Verify, do not change.** Re-confirm in the executor's first action.
- `apps/api/src/db/migrations/012_add_result_url_to_ai_jobs.sql` — adds `result_url` after `result_asset_id`. The reshape in 014 must preserve this column.
- `apps/api/src/__tests__/integration/migration-008.test.ts` and `migration-008.fixtures.ts` — the **canonical pattern** for migration integration tests. Copy this structure for the new tests.
- `apps/api/src/repositories/aiGenerationJob.repository.ts` — currently SELECTs `provider`, `type` and INSERTs them. **Do NOT modify in this task.** It will break after migration 014, but is fixed by the very next ticket in the rework epic (BE service reshape). This is intentional and acceptable.
- `apps/media-worker/src/jobs/ai-generate.job.ts` — UPDATEs `ai_generation_jobs` (does not select `provider`/`type` — only writes `result_asset_id`, `result_url`, `status`). The UPDATE will continue to work after the reshape. **Do NOT modify in this task.**
- `apps/api/src/services/aiGeneration.service.ts` and its test — references `provider` and `type` in INSERTs. **Do NOT modify in this task.** Same rationale as repo.
- `docker-compose.yml` line 16 — confirms migrations mount path. No edit needed.

---

## Subtasks

- [ ] **1. Re-verify the seed migration is clean and inventory existing column shape**
  - What: Open `apps/api/src/db/migrations/011_seed_dev_user.sql` and confirm it inserts only into `users`, not `ai_provider_configs`. Open `010_ai_generation_jobs.sql` and `012_add_result_url_to_ai_jobs.sql` and write down the exact list of columns currently on `ai_generation_jobs` that the new migration must preserve. Open `009_ai_provider_configs.sql` and confirm the table name and that no other migration depends on it.
  - Where: `apps/api/src/db/migrations/{009,010,011,012}_*.sql`
  - Why: Avoids planning the migration on stale assumptions. Catches the case where a teammate quietly added a row to seed migration after this plan was written.
  - Depends on: none

- [ ] **2. Write `apps/api/src/db/migrations/013_drop_ai_provider_configs.sql`**
  - What: A single migration that runs `DROP TABLE IF EXISTS ai_provider_configs;` with header comments (purpose, idempotency note, DOWN-comment with `-- DOWN: (no-op — table is gone permanently)`). No additional logic. Idempotent by virtue of `IF EXISTS`.
  - Where: New file `apps/api/src/db/migrations/013_drop_ai_provider_configs.sql`
  - Why: Removes the now-obsolete BYOK provider-key storage table from the schema. Forward-only migration matches the project's existing convention.
  - Depends on: 1

- [ ] **3. Write `apps/api/src/db/migrations/014_ai_jobs_fal_reshape.sql`**
  - What: A single migration that reshapes `ai_generation_jobs` for fal.ai. Required statements (in order, all idempotent / guarded):
    1. `TRUNCATE TABLE ai_generation_jobs;` — required because `model_id NOT NULL` cannot be added to a populated table without a default. Document in a comment that pre-launch dev data is intentionally discarded.
    2. `ALTER TABLE ai_generation_jobs DROP COLUMN provider;`
    3. `ALTER TABLE ai_generation_jobs DROP COLUMN type;` (drop entirely — `capability` replaces it)
    4. `ALTER TABLE ai_generation_jobs ADD COLUMN model_id VARCHAR(128) NOT NULL AFTER project_id;`
    5. `ALTER TABLE ai_generation_jobs ADD COLUMN capability ENUM('text_to_image','image_edit','text_to_video','image_to_video') NOT NULL AFTER model_id;`
  - Add an `INDEX idx_ai_generation_jobs_model_capability (model_id, capability)` for catalog-grouped lookups.
  - Preserve untouched: `job_id`, `user_id`, `project_id`, `prompt`, `options`, `status`, `progress`, `result_asset_id`, `result_url`, `error_message`, `created_at`, `updated_at`, all FK constraints, the existing indexes `idx_ai_generation_jobs_user_status` and `idx_ai_generation_jobs_project_id`.
  - File header: purpose, idempotency note, `-- DOWN:` comment block listing the inverse statements.
  - ⚠️ Idempotency: wrap each ALTER in an `information_schema.COLUMNS` check (use a stored-procedure or signal-based approach, OR rely on the fact that on first boot the table is freshly created from migration 010 and ALTERs will succeed once). If the executor finds idempotency hard to express in pure DDL on MySQL 8, it is acceptable to use `DROP TABLE IF EXISTS ai_generation_jobs;` followed by a full `CREATE TABLE` with the new shape **only if** a code comment explicitly explains why and the new CREATE preserves all original FKs/indexes verbatim. Prefer ALTERs if feasible.
  - Where: New file `apps/api/src/db/migrations/014_ai_jobs_fal_reshape.sql`
  - Why: Decouples the job table from per-provider ENUMs and prepares it for free-form `model_id` + grouped `capability`, which the fal.ai catalog (next epic ticket) will populate.
  - Depends on: 2

- [ ] **4. Add integration test `apps/api/src/__tests__/integration/migration-013.test.ts`**
  - What: Mirror the structure of `migration-008.test.ts`. Steps: connect to DB, manually create a stub `ai_provider_configs` table (so the DROP has something to drop on a fresh test DB), run the migration SQL, assert via `information_schema.TABLES` that `ai_provider_configs` no longer exists in the current schema. Add a second test case running the migration twice (idempotency).
  - Reuse the fixtures pattern from `migration-008.fixtures.ts` — create a tiny `migration-013.fixtures.ts` exporting `MIGRATION_PATH`, `dbConfig()`, `readMigrationSql()`. Or extend the existing fixtures file with a parametrized `readMigrationSql(name)`.
  - Where: New file(s) under `apps/api/src/__tests__/integration/`
  - Why: Locks the contract — accidental re-introduction of `ai_provider_configs` will be caught by CI.
  - Depends on: 2

- [ ] **5. Add integration test `apps/api/src/__tests__/integration/migration-014.test.ts`**
  - What: Mirror `migration-008.test.ts`. Steps: connect; run migrations 010, 011, 012 in order to set up the original `ai_generation_jobs` table with `result_url`; run migration 014; then assert via `information_schema.COLUMNS`:
    - `model_id` exists, `VARCHAR(128)`, `NOT NULL`
    - `capability` exists, `ENUM`, `NOT NULL`, allowed values are exactly `text_to_image`, `image_edit`, `text_to_video`, `image_to_video`
    - `provider` does NOT exist on the table
    - `type` does NOT exist on the table
    - `prompt`, `options`, `status`, `progress`, `result_asset_id`, `result_url`, `error_message`, `created_at`, `updated_at` all still exist with the original types
  - Add an idempotency case: re-running migration 014 must not throw (this is the place where the executor's choice of idempotency strategy in subtask 3 gets validated).
  - Where: New file under `apps/api/src/__tests__/integration/`
  - Why: Locks the new schema contract. Catches accidental column drift. Validates idempotency.
  - Depends on: 3

- [ ] **6. Document the new migrations in `docs/architecture-rules.md`**
  - What: Find any list/index of migrations in `docs/architecture-rules.md` (search for `migrations` and the existing migration filenames). If a registry exists, append entries for `013_drop_ai_provider_configs.sql` and `014_ai_jobs_fal_reshape.sql` with one-line descriptions. If no explicit list exists, this subtask is a no-op — confirm and skip. Do NOT invent a new section.
  - Where: `docs/architecture-rules.md` (search-and-update only)
  - Why: Keeps the migration registry in sync. Prevents the next agent from "discovering" undocumented migrations.
  - Depends on: 3

- [ ] **7. Validate end-to-end on a fresh dev DB volume**
  - What: Run `docker compose down -v` (wipes volumes), then `docker compose up -d db` (boots DB, applies all migrations 001–014). Then `docker compose exec db mysql -ucliptale -pcliptale cliptale -e "DESCRIBE ai_generation_jobs; SHOW TABLES LIKE 'ai_provider_configs';"`. Verify visually:
    - `ai_provider_configs` is absent from `SHOW TABLES`
    - `ai_generation_jobs` has `model_id`, `capability`, no `provider`, no `type`, all preserved columns intact
  - Run the new vitest integration tests (subtasks 4 + 5) against the running DB.
  - Where: terminal — no code change
  - Why: Catches docker-compose mount/order issues that pure unit tests will miss. Confirms the migrations work in the actual deployment shape, not just in isolation.
  - Depends on: 4, 5, 6

---

## Open Questions / Blockers

**None — all decisions have been confirmed by the user during planning:**

1. ✅ **Destructive migration approved** — pre-launch dev DB; `TRUNCATE` of `ai_generation_jobs` and full DROP of `ai_provider_configs` are explicitly authorized. Confirmed 2026-04-09.
2. ✅ **`type` column dropped entirely** — replaced by `capability`, not partially edited. (Resolved during planning per the ticket text's offered options.)
3. ✅ **Forward migrations only, no edits to 009/010/012** — preserves migration history; matches the ticket's explicit instruction.
4. ⚠️ **Downstream code will be temporarily broken** — `aiGenerationJob.repository.ts` and `aiGeneration.service.ts` will fail their existing INSERTs (they reference `provider`, `type`). This is **expected** and **out of scope** for this ticket — the next epic ticket ([BE] [DELETE] Tear Out Per-Provider Key Storage Layer + the BE service rework that follows) replaces them. Do NOT modify those files in this task. The API may not boot cleanly between this task and the next; that is acceptable on a pre-launch dev branch.

---

## Notes for the implementing agent

**Hard rules — do not break these:**

- **Do NOT touch** `aiGenerationJob.repository.ts`, `aiGeneration.service.ts`, `aiGeneration.controller.ts`, `aiProvider.*`, or any media-worker provider adapter in this task. Those are owned by subsequent tickets in the EPIC 9 rework. Mixing them in here will cause merge pain and break the build sequence.
- **Do NOT edit existing migrations 009, 010, 011, or 012.** Forward migrations only. The history must remain intact.
- **Do NOT add `npm` / `pnpm` dependencies** for this task. Pure SQL + existing test infrastructure.
- **Do NOT** reintroduce the words "provider", "API key", "encryption", or "BYOK" anywhere in the new files (they're being deleted from the product surface). The new schema talks only about `model_id` and `capability`.

**Patterns to follow:**

- **Migration file header comments**: read `008_users_auth.sql` and `010_ai_generation_jobs.sql` for the comment style — top-of-file `-- Migration: NNN_name` line, multi-line description, `-- DOWN (for rollback):` block as a comment.
- **Integration test pattern**: start from `migration-008.test.ts` + `migration-008.fixtures.ts`. Use `multipleStatements: true` in mysql2 connection config so a multi-statement migration file can run in one query. Use `information_schema.COLUMNS` and `information_schema.TABLES` to assert structure rather than running real INSERTs.
- **Naming**: snake_case for SQL columns; the file numbers continue from 012 → 013 → 014.

**MySQL 8 specifics to keep in mind:**

- `DROP COLUMN` on a column referenced by an FK requires the FK to be dropped first. Confirm via `SHOW CREATE TABLE ai_generation_jobs` that the FKs do NOT reference `provider` or `type`. They reference `user_id`, `project_id`, `result_asset_id` only — so `DROP COLUMN provider/type` is safe.
- Re-running `ALTER TABLE … DROP COLUMN x` against a table where `x` is already gone will throw `1091 (42000): Can't DROP 'x'; check that column/key exists`. If you need re-runnability without recreating the table, gate each ALTER with a stored procedure or `IF EXISTS` workaround. The simplest re-runnable strategy on MySQL 8 is the `DROP TABLE IF EXISTS … ; CREATE TABLE …` fallback noted in subtask 3 — it's allowed but not preferred.

**Knowledge already gathered during planning (don't re-discover):**

- `011_seed_dev_user.sql` only inserts into `users`. No provider config rows to remove. Already verified.
- `apps/media-worker/src/jobs/ai-generate.job.ts` only **writes** to `ai_generation_jobs` (UPDATE statements), it never SELECTs `provider` or `type`. Reshape is safe for the worker's update path; the breakage is on the API insert path.
- `apps/api/src/repositories/aiGenerationJob.repository.ts` lines 75-89: this is the INSERT that breaks after migration 014. Out of scope to fix here.
- The migration test convention writes a `migration-NNN.fixtures.ts` for each test file. You can either (a) duplicate the pattern, or (b) generalize by adding a `readMigrationSql(name)` helper to a shared fixtures file. Either is acceptable.
- Architecture rules section about migrations is in `docs/architecture-rules.md` lines 1004–1010. There is no formal migration registry/index in that doc; the file just describes the workflow. Subtask 6 will likely be a no-op confirmation.

**Project memory recall (relevant to this task):**

- Per `feedback_escalate_architecture.md`: stop and ask before any decision that could change product direction. None should arise in this DB-only task — all decisions are pre-approved above. If something surprising surfaces (e.g. an FK constraint issue you didn't expect), pause and ask before improvising.
- Per `project_dev_workflow.md`: all dev testing through Docker Compose. Subtask 7 reflects this — do not test against bare localhost MySQL.
- Per `project_audio_provider.md`: audio generation is going through ElevenLabs separately, not fal.ai. Out of scope for this ticket but means the `capability` ENUM in subtask 3 must NOT include any `text_to_audio` / `audio_*` values — only the four image/video capabilities.

---
_Generated by task-planner skill — 2026-04-09_

---
**Status: Ready For Use By task-executor**
