# API sync report — storyboard-generation-pipeline

> Inline drift check for `contracts/openapi.yaml` (+ `events.md`), run at generation time.
> Sources: `data-model.md` (storyboard_pipeline), `sad.md` §5/§6, `spec.md` §4/§5, repo conventions
> (errors.ts, routes, realtimePublisher.ts, BullMQ queues). Interface kind read from
> `sad.md` frontmatter `target_surfaces: [backend-service, worker, web-frontend]` → **OpenAPI + events**
> (web-frontend consumes; it authors no contract).

## Interface-kind & inputs

- **found:** `sad.md` (§5 participants, §6 8 flows), `spec.md` (§4 8 user stories, §5 15 ACs), `data-model.md` (1 table), CONTEXT.md glossary, 8 Accepted ADRs.
- **Repo conventions verified by scout** — error envelope, route style, auth, realtime channel, BullMQ queues (see deviations below).

## Deliberate deviations from the SDD template (NOT drift — repo reality wins)

The contract is consumed by the existing frontend/worker; it must match what ships, so four template
defaults were overridden. Each is annotated in the YAML header + here:

| # | Template default | This contract | Why |
|---|---|---|---|
| D1 | Error envelope `{code, message, details?}` | `{ error }` base + additive `{ error, code, details }` for 422/429 | `apps/api/src/lib/errors.ts` + central handler (`index.ts`) already serialize this; codes already follow `module.error_name` (`flow.*`, `references.*`). |
| D2 | `/api/v1/<resources>` prefix | resource-first `/storyboards/{draftId}/pipeline/...`, no version prefix | Matches `storyboard.routes.ts`, `storyboard-references.routes.ts`. |
| D3 | `Idempotency-Key` header on mutating retriable ops | server-enforced idempotency (active-run marker + version CAS); duplicate → 200 existing run | ADR-0007 / AC-14 — the design's idempotency mechanism is the row, not a client key. No `Idempotency-Key` anywhere in the repo. |
| D4 | New `module.action.vN` event name + snake envelope | reuse `storyboard.status.updated` + camelCase repo envelope | `realtimePublisher.ts:37`; observer tabs already subscribe to this channel. |

## Field-origins table (`operation.field` → origin → confidence)

| Operation · field | Origin | Confidence |
|---|---|---|
| `getPipelineState` → 200 `PipelineState.draft_id` | data-model `storyboard_pipeline.draft_id` (PK) | High |
| · `active_phase` | `storyboard_pipeline.active_phase` ENUM | High |
| · `active_run_phase` | `storyboard_pipeline.active_run_phase` ENUM nullable | High |
| · `phases.<phase>.status` | the four `<phase>_status` ENUM(7) columns | High |
| · `payload.loader_label` | `payload_json` (loader label variant) | High |
| · `payload.cast_proposal` | `payload_json` (opaque) ← **inherited cast-extraction output** | **Low — finding B1** |
| · `payload.scene_image_offer` | `payload_json` (offer variant) | Medium |
| · `version` | `storyboard_pipeline.version` INT UNSIGNED | High |
| · `cost_estimate` | `storyboard_pipeline.cost_estimate` DECIMAL(10,4) | High |
| · `error_message` | `storyboard_pipeline.error_message` VARCHAR(512) | High |
| · `updated_at` | `storyboard_pipeline.updated_at` DATETIME(3) | High |
| `confirmCast` → req `CastConfirmation.references[]` | **inherited cast-extraction contract** (not this feature's data-model) | **Low — finding B1** |
| · `ProposedReference.scene_ids[]` | `storyboard_blocks.id` (existing scene blocks) | High |
| · `ProposedReference.kind` | CONTEXT glossary (Character / Environment) | Medium |
| `triggerPhase` / `cancelPhase` / `skipPhase` → `{phase}` path | `active_phase` ENUM values | High |
| all → 422 `GateError.code` | NEW `pipeline.*` codes — **finding A2** | n/a |
| all → 429 `RateLimitError.code` | existing `flow.rate_limited` | High |
| all → 404 `Error.error` | deny-and-hide (AC-13); repo `NotFoundError` | High |

**Not exposed (intentional):** `phase_started_at`, `heartbeat_at` (liveness internals), `actual_cost`
(telemetry-only per data-model), `created_at` (audit). Documented in `PipelineState` schema.

## Forward drift checklist (contract derived correctly)

- [x] **endpoint ↔ model** — every operation reads/writes `storyboard_pipeline`; every response field
  traces to a column (table above). ✓
- [⚠] **error-code ↔ repo** — `flow.rate_limited` exists. The four `pipeline.*` codes are **NEW**
  (do not yet exist in `lib/errors.ts`). **Finding A2** (expected for a new feature; forward task).
- [x] **validation ↔ constraint** — `error_message` maxLength 512 ✓, `cost_estimate` scale-4 decimal
  string ✓, `version` integer ≥ 1 ✓, all enums copied verbatim from the model's ENUM types ✓.
- [x] **OpenAPI ↔ sequence** — every §6 `alt`-branch has a response (table below). ✓

## Back-feed coverage cross-check

**Every §5 AC → ≥ 1 operation/response:**

| AC | Covered by |
|---|---|
| AC-01 auto-start | `getPipelineState` (lazy create + start side-effect, Flow 1) |
| AC-02 cast modal | `getPipelineState` `awaiting_review` state + `storyboard.status.updated` |
| AC-03 confirm cast | `confirmCast` 200 |
| AC-04 accept scene-image | `triggerPhase` `scene_image` 200 |
| AC-05 resume/observer | `getPipelineState` + event convergence |
| AC-06 cancel + incremental re-trigger | `cancelPhase` + `triggerPhase` (Flow 3 both `alt` arms) |
| AC-07 skip | `skipPhase` |
| AC-08 phase order | `triggerPhase` 422 `pipeline.phase_out_of_order` |
| AC-09 ref-below-music | `confirmCast` (server behavior; ordering is creation-time, not a field) |
| AC-10 refs feed scenes | `triggerPhase` `scene_image` (worker behavior; events.md) |
| AC-11 text-only fallback | `triggerPhase` `scene_image` (worker behavior; events.md) |
| AC-12 stuck/failed | `getPipelineState` `failed` state + reaper event (events.md) |
| AC-13 authz deny-hide | **all** operations → 404 `NotFoundOpaque` |
| AC-14 idempotent | `confirmCast` / `triggerPhase` 200-on-duplicate |
| AC-15 scene-image prereq | `triggerPhase` 422 `pipeline.scenes_required` |

**Every operation → §4 user story + ≥ 1 AC:** getPipelineState→US-01/US-05 (AC-01/05/12);
confirmCast→US-03 (AC-03/09/14); triggerPhase→US-04/US-07 (AC-04/06/08/14/15); cancelPhase→US-06
(AC-06); skipPhase→US-07 (AC-07). No orphan operation. ✓

**Every §6 alt-branch → a response:** Flow 3 (unfinished / all-done) → 200 variants ✓; Flow 5
(AC-08 / AC-15) → 422 two codes ✓; Flow 6 (first / double-confirm) → 200 running / existing ✓;
Flow 7 (Ready ref / text-only) → worker, 200 ✓; Cross-cutting authz → 404 ✓.

## Findings (resolve before finalize)

### B1 — `cast_proposal` / `CastConfirmation` shape has no typed origin in this feature **[RESOLVED — Accept-as-is, owner 2026-06-13]**
The cast-proposal payload and the confirm-cast body are typed against the **inherited cast-extraction
contract**, not `storyboard-generation-pipeline`'s `data-model.md` (where they live inside opaque
`payload_json`). I typed them loosely (`additionalProperties: true`, `name/kind/scene_ids`) so the
contract isn't invented out of nothing, but `name`/`kind` are Low/Medium confidence. This is a
data-model/source gap, not an api bug.
**Resolution:** Owner chose **Accept-as-is** — the loose schema ships. `scene_ids` is High-confidence
(→ `storyboard_blocks.id`); precise typing of the cast structure is deferred to `implement`, locked
against the inherited cast-extraction code at that point. No upstream artifact re-opened.

### A2 — four NEW `pipeline.*` error codes not yet in `lib/errors.ts` **[informational — forward task]**
`pipeline.phase_out_of_order`, `pipeline.scenes_required`, `pipeline.not_awaiting_review`,
`pipeline.estimate_revalidation_failed`. Expected for a new feature; they follow the existing
`module.error_name` convention and must be added as typed sentinels (GateError subclasses) during
`implement`. Resolution: **Accept** (tracked as an implement task).

### A3 — guard responses with no §6 branch drawn **[minor sequence gap — resolved in-contract]**
`skip` on a non-`awaiting_review` phase, and `confirm-cast` estimate re-validation failure, have no
explicit §6 `alt`-branch. Resolved sensibly: 422 `pipeline.not_awaiting_review` /
`pipeline.estimate_revalidation_failed`. `cancel` on a non-running phase → idempotent 200 no-op (no
error). Low severity; flag only.

### A4 — `getPipelineState` (GET) has documented side effects **[noted — faithful to §6]**
Auto-create + auto-start (Flow 1) and lazy stuck-release (Flow 2) make the read non-pure. This is
**derived directly from the sequences**, not a contract invention; both side-effects are idempotent.
Documented in the operation description. No action.

## Verdict

Forward 3/4 ✓ (error-code ⚠ = expected NEW codes). Back-feed: all 15 ACs, all operations, all
`alt`-branches covered. B1 **resolved** (Accept-as-is, owner 2026-06-13); A2/A3/A4
resolved/informational. No core finding fails. **Contract finalized.**

## Lint

Suggested: `npx @stoplight/spectral-cli lint docs/features/storyboard-generation-pipeline/contracts/openapi.yaml`
(not yet wired into the repo's check target — add it there when the contract is implemented).
