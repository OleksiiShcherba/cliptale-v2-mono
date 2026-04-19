---
name: Migration reliability is an ongoing hazard in this repo
description: Migrations using INFORMATION_SCHEMA + PREPARE/EXECUTE guards apply unreliably under docker-entrypoint-initdb.d — live DB drifts from repo
type: project
---

Migration files in `apps/api/src/db/migrations/` that use the `INFORMATION_SCHEMA + PREPARE/EXECUTE` idempotent-guard pattern (migrations 015, 024, 025, 026 confirmed) apply **partially or not at all** when run by MySQL's `docker-entrypoint-initdb.d` on first-volume boot. Subsequent `docker compose up` does NOT re-run init scripts — they only fire on empty `db_data` volume.

Confirmed symptoms observed 2026-04-19 (Files-as-Root Batch 2 guardian review):
- `ai_generation_jobs`: migrations 015 (widen capability ENUM to 8 values), 025 (drop project_id column), 026 (add draft_id column) all failed to apply
- `project_assets_current` table: migration 024 step 11–12 (DROP TABLE) did not apply, table still exists alongside the new `files` table
- Meanwhile, OTHER parts of the same migration 024 DID apply (caption_tracks.asset_id → file_id renamed, project_clips_current.asset_id → file_id renamed)
- Net effect: the code layer writes to new columns (`output_file_id`, `draft_id`) that don't exist on live DB → 500s on AI-generate happy path

**Why:** The root cause was that INFORMATION_SCHEMA + PREPARE/EXECUTE guards in MySQL's docker-entrypoint-initdb.d multi-statement batch context sometimes evaluated incorrectly, leaving DDL unapplied even though the script ran without error. The `docker volume rm` workaround was a band-aid that hid this.

**Fix (batch 2026-04-19):** An in-process migration runner now owns all schema changes. The runner lives at `apps/api/src/db/migrate.ts` and is invoked from `apps/api/src/index.ts` before `app.listen()`. It uses a `schema_migrations` bookkeeping table with SHA-256 checksums to track applied files. Each migration runs on a dedicated `multipleStatements: true` connection; the bookkeeping row is only written AFTER the DDL succeeds. The `docker-entrypoint-initdb.d` mount is no longer the primary migration path.

**How to apply:**
- When reviewing a batch that includes migrations, verify live DB state via `docker compose exec -T db mysql ... DESCRIBE <table>` for the tables the migration touched.
- Classify test failures carefully: "DB column doesn't exist" / "Field X doesn't have a default value" / "Data truncated for column X" are NOT pre-existing; they are live evidence the migration didn't apply.
- The DEV_AUTH_BYPASS cluster (~23 tests expecting 401 but getting 2xx/409) IS legitimately pre-existing and separate from the schema-drift cluster — don't conflate the two.
- The `schema_migrations` table contents can be inspected with: `docker compose exec -T db mysql -ucliptale -pcliptale cliptale -e "SELECT filename, applied_at FROM schema_migrations ORDER BY applied_at;"`
