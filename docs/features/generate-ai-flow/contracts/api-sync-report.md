# API sync report — generate-ai-flow

> Drift check for `contracts/openapi.yaml` (+ `events.md`), derived from `data-model.md` +
> `sad.md` §6 sequences + `spec.md` §4/§5. Interface kind read from `sad.md` frontmatter
> `target_surfaces: [web-frontend, backend-service, worker]` → **HTTP/REST contract for the
> `backend-service`** + an **event contract for the `worker`**; `web-frontend` consumes both.
>
> **Inputs found:** data-model.md ✓ · sad.md ✓ (§6 has 9 sequences) · spec.md ✓ · CONTEXT.md ✓ ·
> adr/ ✓ (0001–0007) · existing live API conventions read from `apps/api` + `packages/api-contracts`.

## Brownfield deviations from the SDD defaults (all = "follow the live ClipTale API")

The repo is a brownfield this feature **extends, not replaces** (sad.md §2). Four SDD-default
conventions are overridden by the live convention. None is an ADR; all are recorded here.

| SDD default | Live ClipTale convention (followed) | Evidence |
|---|---|---|
| Error body `{code, message, details?}` | `{ error }` **+ additive optional `{ code, details }`** | `apps/api/src/index.ts:73` emits `{ error: err.message }`. Team decision 2026-06-03: keep `error`, add machine-readable `code`/`details` (errors.ts + handler gain optional fields) so the FE can branch the 5 Generate gate failures. |
| snake_case JSON keys (`created_at`) | **camelCase** (`createdAt`, `jobId`, `nextCursor`) | existing responses: `jobId`/`outputFileId`/`resultUrl`/`errorMessage` (aiGeneration.service.ts), `nextCursor` (openapi.ts assets). |
| `?after=&before=` cursor pagination | `cursor` + `limit` → `{ items, nextCursor }` | `GET /projects/:id/assets` (openapi.ts:264–329), `limit` default 24. |
| `/api/v1/...` URL prefix | **no prefix** — rooted paths (`/generation-flows`) | routes mounted at `/` (e.g. `/generation-drafts`, `/ai/jobs/:jobId`). |

## Section A — field-origins table

One row per `(operation, field)`. `high` = traces to a `data-model.md` column with matching
type/constraint; `medium` = derived (response-only / code-catalog, no DB column); `low` = inferred
from a sequence message only.

| schema_path | origin | confidence |
|---|---|---|
| FlowSummary.flowId / Flow.flowId | data-model.md → generation_flows.flow_id (CHAR36 uuid) | high |
| FlowSummary.title / Flow.title / FlowCreate.title / FlowRename.title | data-model.md → generation_flows.title (VARCHAR255, default 'Untitled flow') | high |
| FlowSummary.version / Flow.version / CanvasSave.version / CanvasSaveResult.version / GenerateRequest.version | data-model.md → generation_flows.version (INT UNSIGNED, min 1, optimistic lock ADR-0003) | high |
| FlowSummary.createdAt / Flow.createdAt | data-model.md → generation_flows.created_at (DATETIME(3)) | high |
| FlowSummary.updatedAt / Flow.updatedAt / CanvasSaveResult.updatedAt | data-model.md → generation_flows.updated_at | high |
| Flow.canvas / CanvasSave.canvas | data-model.md → generation_flows.canvas (JSON, opaque; Zod in packages/project-schema, ADR-0002) | high (opaque-by-design) |
| Flow.jobs[] (JobState) | data-model.md → ai_generation_jobs (flow_id/block_id back-links + existing run cols) | high |
| JobState.jobId / JobStatus.jobId / GenerateAccepted.jobId | data-model.md → ai_generation_jobs.job_id (VARCHAR64) | high |
| JobState.blockId / JobStatus.blockId / GenerateAccepted.blockId | data-model.md → ai_generation_jobs.block_id (NEW, nullable) | high |
| JobState.status / JobStatus.status / JobStatusEnum | repo `AiJobStatus` (aiGenerationJob.repository.ts): queued/running/done/failed | high |
| JobState.progress / JobStatus.progress | ai_generation_jobs.progress (existing) | high |
| JobState.outputFileId / JobStatus.outputFileId | ai_generation_jobs.output_file_id (nullable) | high |
| JobState.resultUrl / JobStatus.resultUrl | ai_generation_jobs.result_url (existing) | high |
| JobState.errorMessage / JobStatus.errorMessage | repo GetJobStatusResult.errorMessage (failure reason, AC-09) | high |
| JobStatus.flowId | ai_generation_jobs.flow_id (NEW, nullable) | high |
| GenerateAccepted.status (enum [queued]) | existing SubmitGenerationResult `{ jobId, status:'queued' }` | high |
| FlowSummaryPage.items / nextCursor | derived — repo cursor-page convention (GET /projects/:id/assets) | high |
| CostEstimate.modelId | ai_generation_jobs.model_id / catalog model id | high |
| CostEstimate.estimate / Money (currency, amount) | ADR-0005 static pricing table (lib/flow-pricing.ts) — response-only, no DB column | medium |
| CostEstimate.bestEffort | derived — ADR-0005 "best-effort, reconcile out of band" | medium |
| GenerateRequest.acknowledgedCost | derived — cost-gate confirmation echo (Flow 1); advisory, server authoritative | medium |
| AiModel.* (id, provider, capability, label, inputSchema) | packages/api-contracts AI_MODELS / FalModel (code catalog, no DB table) | high (code) |
| ModelField.{name,type,label,required,default,enum,min,max} | packages/api-contracts FalFieldSchema (existing) | high (code) |
| ModelField.modality | **ADR-0006** catalog extension — derived per field type; no DB column (data-model.md §catalog) | medium |
| ModelField.exclusiveGroup | **ADR-0006** catalog extension — "exactly one of" group (AC-06); no DB column | medium |
| Error.error | repo central handler `{ error: err.message }` (index.ts:73) | high |
| Error.code | NEW additive field (team decision 2026-06-03) — neutral `module.error_name` | medium |
| Error.details | NEW additive field — structured context (which block/input/version) | medium |

No `low` rows: every field traces to a column, a code-level catalog, an Accepted ADR, or a named
repo convention.

## Section B — drift findings (4-point checklist, bidirectional)

### Forward — contract derived correctly

1. **Endpoint ↔ data-model** *(core)* — ✓. Every endpoint reads/writes a `data-model.md` entity:
   list/create/read/rename/delete + canvas-save → `generation_flows`; generate → `ai_generation_jobs`
   (flow_id/block_id) + `flow_files`; estimate → reads `generation_flows.canvas`; job-poll →
   `ai_generation_jobs`. `GET /ai/models` is the existing catalog (code, not DB) — flagged as reused.

2. **Error code ↔ repo error definition** *(core)* — ⚠ **resolved with caveats** (see below). The repo
   has **no `code` registry** — it emits free-text `{ error }` only. The contract's `code` values are
   the **proposal** introduced by the 2026-06-03 decision; they are NOT yet in `errors.ts`. Two sub-points:
   - Status→class mapping is faithful to `errors.ts`: 400 ValidationError, 401 UnauthorizedError,
     404 NotFoundError, 409 OptimisticLockError, 422 UnprocessableEntityError. ✓
   - **`429` has no sentinel** in `errors.ts` (no `TooManyRequestsError`). `flow.rate_limited` needs
     either a new 429 error class or express-rate-limit's default 429 handler. → **F-1** below.
   - The `code` strings + the additive `details` need `errors.ts` + the central handler
     (index.ts:73) to carry optional `code`/`details`. → **F-2** below.

3. **Validation ↔ constraint** *(core)* — ✓. `title` maxLength 255 = `generation_flows.title`
   VARCHAR(255); `version` integer ≥ 1 = INT UNSIGNED min 1; `modelId` maxLength 128 = model_id
   VARCHAR(128); `status` enum = repo AiJobStatus verbatim; `progress` 0–100; uuid formats on every
   `*Id`. No constraint is looser or stricter than its column.

4. **OpenAPI ↔ sequence** *(supporting)* — ✓. Every §6 `alt`-branch has a response:
   - Flow 4 "stale version → conflict" → `PUT …/canvas` 409 `flow.version_conflict` (AC-10b).
   - Flow 3 / Flow 9 "not owned → not found (no existence disclosure)" → 404 `flow.not_found` (AC-04).
   - Flow 7 five gate branches → `generate` 422 `flow.required_input_missing` / `flow.exclusivity_violation`
     / `flow.asset_missing` / `flow.content_invalid` + 429 `flow.rate_limited` (AC-03/05/06/17 + rate limit).
   - Flow 1/8 success/failure/retries-exhausted → async `ai.job.updated` (events.md), not an HTTP branch.

### Back-feed — coverage cross-check

**Every spec §5 AC maps to ≥1 operation/response:**

| AC | Covered by |
|---|---|
| AC-01 / AC-12 / AC-13 (generate image/audio/video happy) | `POST …/generate` 202 → `ai.job.updated` done |
| AC-15 (assemble blocks) / AC-16 (content+params) | `PUT …/canvas` (persisted in opaque canvas) |
| AC-02 (typed-connection block) | **client-side only** — catalog `modality` (`GET /ai/models`, ADR-0006); persisted via `PUT …/canvas`. No server enforcement endpoint by design (SAD §8, Flow 5 ≤100 ms, no round-trip). |
| AC-03 (missing input) | `generate` 422 `flow.required_input_missing` |
| AC-04 (non-owner) | 404 `flow.not_found` on every flow op (existence hiding) |
| AC-05 (missing library asset) | `generate` 422 `flow.asset_missing` (previously-owned) / 404 for never-owned |
| AC-06 (exclusivity) | `generate` 422 `flow.exclusivity_violation` + catalog `exclusiveGroup` |
| AC-07 (model-change reconciles handles) | **client-side only** — `useFlowCanvas` + catalog; persisted via `PUT …/canvas` (SAD §8). |
| AC-08 (async progress + dominant preview) | `ai.job.updated` progress (events.md); preview is a FE rendering concern, no API. |
| AC-08b (reattach on reopen) | `GET …/{flowId}` (embeds `jobs[]` last-known state) + `GET /ai/jobs/{jobId}` poll + ws |
| AC-09 (failed / empty) | `ai.job.updated` failed + retry = fresh `generate` |
| AC-10 (flow persists) | `GET …/{flowId}` restores canvas + results |
| AC-10b (two-tab conflict) | `PUT …/canvas` 409 `flow.version_conflict` |
| AC-11 (cost-confirm cancel → no charge) | **client-side** — cancel means `generate` is never called; `POST …/estimate` is the non-charging pre-flight. |
| AC-14 (single result per Generate) | worker keeps first output (events.md success branch); `GenerateAccepted` is 1 job. |
| AC-17 (empty/invalid content) | `generate` 422 `flow.content_invalid` |
| AC-18 (reuse result as input) | catalog modality match (client) + persisted via `PUT …/canvas`; reused on next `generate`. |
| AC-19 (delete preserves assets) | `DELETE …/{flowId}` (soft-delete + flow_files cascade, file RESTRICT) |

**Every operation maps to a §4 story + ≥1 AC:** list/create/read/rename/delete → US-01
(AC-04/10/19); canvas-save → US-02/03/04 (AC-15/16/10b); estimate → US-05 (Flow 1/AC-11);
generate → US-05 (AC-01/03/05/06/12/13/14/17); job-poll → US-06/07 (AC-08b/09); models → US-03
(AC-02/06/07). No orphan endpoint.

**Sequence gaps (a needed response with no §6 branch):** none new. AC-02/AC-07/AC-11/AC-08 are
deliberately client-side or rendering concerns with no server branch — consistent with SAD §8 and
the §6 flows (Flow 5 draws the typed-connection check on `Web`, not `API`). Not a gap.

## Flagged findings (resolve before / during `sdd:tasks`)

- **F-1 (core, drift point 2) — no 429 sentinel.** `errors.ts` lacks a `TooManyRequestsError(429)`;
  the contract's 429 `flow.rate_limited` (ADR-0004) needs one, OR map onto express-rate-limit's
  default 429 handler. **Disposition: Save-as-task** — implement adds the sentinel (or wires the
  rate-limit middleware) when building `flow-generate.service`. Not a contract bug.
- **F-2 (core, drift point 2) — additive `code`/`details` not yet in the repo.** The team-approved
  envelope needs `errors.ts` error classes + the central handler (index.ts:73) to optionally carry
  `code`/`details`. **Disposition: Save-as-task** — an additive, backward-compatible handler change
  (existing `{ error }`-only clients unaffected). Tracked for `sdd:tasks`.
- **F-3 (supporting) — Idempotency-Key on `generate` is a hardening, not an existing guarantee.**
  The existing `POST /projects/:id/ai/generate` does NOT require an Idempotency-Key. The contract
  marks it **required** on the spend-bearing flow generate (TTL 24h) to prevent double-charge on a
  network retry. This is the SAD §6/§11 "confirm the pipeline keys on jobId, else an ADR is owed"
  flag. **Disposition: confirm in `sdd:tasks`** — either the worker's existing jobId keying suffices
  (document it) or a small submit-side dedupe is added. Surfaced, not silently assumed.

No core finding leaves the contract internally inconsistent: F-1/F-2 are *implementation* obligations
the contract correctly anticipates, recorded so `tasks`/`implement` pick them up.

## Lint

`spectral lint contracts/openapi.yaml` is the suggested gate (not yet wired into the repo's check
target — `packages/api-contracts` is hand-maintained TS, no YAML lint step exists). Add spectral to
the check target when the contract is promoted into `packages/api-contracts/src/openapi.ts`.
