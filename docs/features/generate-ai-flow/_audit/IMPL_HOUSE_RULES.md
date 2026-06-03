# generate-ai-flow — implementation house rules (READ FIRST, every task)

Monorepo: npm workspaces + turbo + vitest. Feature branch: `feat/generate-ai-flow` (already checked out — commit here).

## TDD cycle — MANDATORY, per task
`SELECT → RED → GREEN → REFACTOR → GATE → COMMIT`.
1. **RED**: write the failing test(s) FIRST (before any production code), run them, and state the classification aloud — GOOD red (assertion/“not implemented” fails) / BAD red (test won’t compile → fix the test) / false-pass (green immediately → strengthen the test) / NON-red (skipped, dep unavailable). **Quote the failing line.**
2. **GREEN**: least code to make the quoted failure pass. Touch only this task’s `files_hint` (+ their tests).
3. **REFACTOR**: tidy while staying green.
4. **GATE** (below) must be clean.
5. **COMMIT** (below).
Never write production code before a failing test. **Never weaken a test to make it pass** — if an AC seems wrong, STOP and report.

## Commands — run from the PACKAGE dir, never repo root
- API (unit + integration together; integration hits real MySQL): `cd apps/api && APP_DB_PASSWORD=cliptale npx vitest run <path>`
- web-editor (jsdom — MUST be from this dir): `cd apps/web-editor && npx vitest run <path>`
- media-worker: `cd apps/media-worker && npx vitest run <path>`
- a package: `cd packages/<pkg> && npx vitest run`

## GATE (brownfield-adjusted — these gates differ from the generic skill)
- **unit**: green — required.
- **integration**: green where it runs (DB/Redis are up — see below). If a real-infra test genuinely can’t run, mark NON-red and say so; do not fake it.
- **lint**: **SKIP**. There is no `eslint.config.js` anywhere in the repo → `eslint` is unresolvable locally. Do NOT block on lint.
- **vet/typecheck**: whole-repo `tsc --noEmit` is **pre-existing-RED** (~131 errors on master). Do NOT require a clean repo. Require **zero NEW errors in THIS task’s files**: `cd apps/<pkg> && npx tsc --noEmit 2>&1 | grep -E '<your-changed-file-paths>'` must print nothing.

## Live infra (already running — 16h up, healthy)
- **MySQL 8**: `localhost:3306` db=`cliptale` user=`cliptale` pass=`cliptale`. Migrations ≤ `045` applied. `ai_generation_jobs`, `files`, `users`, `projects` exist; `generation_flows`/`flow_files` do NOT yet (T1/T2 create them).
- **Redis**: host port **6380** (container 6379). For host-run tests use `redis://localhost:6380`. The vitest setup defaults `APP_REDIS_URL` to `:6379` — override to `:6380` in any test that talks to real Redis (T10/T21 rate-limit).

## Migration tasks (T1–T3) — promote + apply
Live runner = `apps/api/src/db/migrate.ts`: **forward-only single `.sql` files**, numbered `NNN_`, **checksummed (NEVER modify an applied file)**, must be idempotent (`IF NOT EXISTS` / `INFORMATION_SCHEMA` guards — re-runnable). Latest live = `045`.
- **Promote** each staged `docs/features/generate-ai-flow/migrations/NN_*.up.sql` body **VERBATIM** into a new live file `apps/api/src/db/migrations/0NN_<name>.sql` — T1→`046_create_generation_flows.sql`, T2→`047_create_flow_files.sql`, T3→`048_add_flow_columns_to_ai_generation_jobs.sql`. Strip only the “STAGED …” header comment; keep the DDL byte-for-byte.
- The `.down.sql` is **NOT** promoted (runner is forward-only). It stays as the frozen design record. You may sanity-check the down SQL against a scratch DB, but do not add it to the live tree.
- **Apply locally** to verify: `cd apps/api && APP_DB_PASSWORD=cliptale npx tsx -e "import('./src/db/migrate.ts').then(m=>m.runPendingMigrations()).then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)})"`. Then re-run once — it must be a no-op (idempotent). Assert the expected indexes/columns via `information_schema`.
- The migration “unit test” follows `apps/api/src/db/__tests__/migrate.unit.test.ts`; a real apply against localhost MySQL is the integration check (DoD: applies cleanly + idempotent + expected indexes present).

## Conventions to COPY (closest precedents — match the repo, don’t invent)
- repository → `apps/api/src/repositories/asset.repository.ts` (+ `asset.repository.test.ts`, `__tests__/integration/asset-repository.integration.test.ts`)
- service → `apps/api/src/services/asset.service.ts`, `aiGeneration.service.ts` (+ `*.integration.test.ts`)
- controller/routes → existing `apps/api/src/controllers/*` + `apps/api/src/routes/*`; **register routes in `apps/api/src/index.ts`** (after middleware)
- error mapping → `apps/api/src/lib/errors.ts` + the error handler in `index.ts` (~line 73). Error body = `{error}` + additive optional `{code,details}` (per `_audit`/api-sync-report). Codes are spec’d in `contracts/openapi.yaml`.
- worker → `apps/media-worker/src` (the ai-generate handler)
- canvas UI → web-editor **storyboard Step 2** (`@xyflow/react`) is the closest precedent; reuse design tokens + shared primitives, the repo’s one styling approach.
- schemas → `packages/project-schema`, `packages/api-contracts` (`FalFieldSchema`, fal-models / elevenlabs-models catalog)
- Full conventions map → `docs/architecture-map.md`.

## ⚠ Cross-cutting gotchas discovered during the build (READ)
- **Stale workspace `dist/`**: apps import the workspace packages (`@ai-video-editor/api-contracts`, `project-schema`) from their **built `dist/`** (gitignored), NOT from `src/`. If your task depends on a change made in `packages/api-contracts` (T5: modality/exclusiveGroup) or `packages/project-schema` (T4: flowCanvas/AiGenerateJobPayload), you MUST rebuild that package before the app's tests will see it: `cd packages/<pkg> && npx tsc -p tsconfig.json` (or its build script). A test asserting on new catalog/schema fields that mysteriously fails on `undefined` is almost always a stale dist.
- **Server-authoritative canvas params contract** (enforced by the T11 gate — UI tasks T17/T18 and enqueue T12 MUST match it):
  - content block: `params.contentType: 'text' | 'asset'`, with `params.text` (for text) or `params.fileId` (for an asset);
  - generation block: `params.modelId`;
  - directly-supplied model params are keyed by the catalog field name;
  - required model inputs are satisfied either by an incoming edge to the field's handle OR a non-empty supplied param; `exclusiveGroup` fields must have **exactly one** provided.
- The 422 gate errors are a `GateError extends UnprocessableEntityError` carrying stable `code` + `details` (in `apps/api/src/lib/errors.ts`): `RequiredInputMissingError`/`ExclusivityViolationError`/`AssetMissingError`/`ContentInvalidError`. T15 maps `code`/`details` into the `{error,code,details}` body.

## Per task
Read the task’s entry in `tasks.json` + its named ACs in `spec.md §5` + the AC rows in `test-plan.md` + the relevant `sad.md` sections + `data-model.md` + `contracts/openapi.yaml`. Implement only `files_hint` (+ tests). Then COMMIT (only this task’s files) with a Conventional-Commit subject and trailers:
```
<type>(generate-ai-flow): <task title, trimmed>

<one line: what + why>

SDD-Task: T<n>
SDD-AC: AC-XX            (one line per satisfied AC; omit if the task has none)
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```
Then flip this task’s row to `done` in `docs/features/generate-ai-flow/tasks/tracker.md`.
