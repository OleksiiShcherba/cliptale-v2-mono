---
status: Draft
owner: "Backend Lead"
reviewers: ["Tech Lead"]
updated_at: "2026-06-07"
feature_size: L
---

# api-sync-report — storyboard-reference-flows

Drift/sync report for `contracts/openapi.yaml` + `contracts/events.md` (generated 2026-06-07).
Inputs read: `data-model.md` (2026-06-07), `sad.md` §5/§6/§8/§9 + 11 Accepted ADRs, `spec.md`
§4/§5/§6/§6.1/§8. **Found:** sad.md ✓ (10 flows, full §4/§5 coverage map), spec.md ✓ — no input
gaps; derivation ran at full width.

**Brownfield deviations from the SDD defaults** (all four follow the existing ClipTale API;
precedent: `generate-ai-flow/contracts/openapi.yaml`, team decision 2026-06-03):

1. Error body = repo's `{error}` + additive optional `{code, details}` — not the bare
   `{code, message, details?}` envelope.
2. JSON keys = camelCase (repo wire convention), columns stay snake_case in origins.
3. URL prefix = none (routes mounted at `/`), not `/api/v1`.
4. `GET …/references/blocks` is a **full canvas read**, not cursor-paginated — canvas-load
   semantics, bounded by NFR (≤ 50 blocks, ≤ 1500 ms); mirrors `GET /storyboards/{draftId}/music`.

**Drift-dialog resolutions (2026-06-07, owner):** 5 flags raised (≥3 → run paused), all resolved
**Fix-the-contract**:

| # | Flag | Resolution |
|---|---|---|
| 1 | Concurrent extraction not drawn in any §6 flow | 409 `references.extraction_in_progress` |
| 2 | Block XY write-path uncovered by AC/flows (ADR-0005 makes the table authoritative) | `PATCH …/references/blocks/{blockId}` — versionless commutative position save |
| 3 | `concurrencyLimit` bounds unspecified (SAD §8 names key + default only) | bounds **1..12** (max = cast size limit) |
| 4 | Inferred precondition codes (`references.script_missing`, `references.no_completed_extraction`) | accepted as low-confidence proposals |
| 5 | Exact creation-rate-limit code unknown in repo | **reconciled (R3):** reuses the shared `flow.rate_limited` — AC-11 binds this to the EXISTING per-user creation limit, so no references-specific code |

## Section A — field-origins table

One row per `(operation, field)`; wire camelCase ↔ column snake_case mapping is mechanical.

| schema_path | origin | confidence |
|---|---|---|
| startCastExtraction.Idempotency-Key | derived (Flow 1 async actor + repo precedent TTL 24h) | high |
| startCastExtraction.202.jobId | data-model → storyboard_cast_extraction_jobs.id | high |
| startCastExtraction.202.status | data-model → …jobs.status ENUM (queued) | high |
| getCastExtraction.jobId / draftId | data-model → …jobs.id / .draft_id | high |
| getCastExtraction.status | data-model → …jobs.status ENUM(queued,running,completed,failed) | high |
| getCastExtraction.proposal[] | data-model → …jobs.proposal_json ({type,name,description,image_file_ids,scene_block_ids,per_run_estimate}) | high |
| getCastExtraction.proposal maxItems 12 | spec §8 OQ-1 resolved + AC-02 (cast size limit) | high |
| getCastExtraction.aggregateEstimateCredits | data-model → …jobs.aggregate_estimate_credits DECIMAL(10,4) | high |
| getCastExtraction.errorMessage | data-model → …jobs.error_message VARCHAR(512) | high |
| getCastExtraction.completedAt / failedAt / createdAt | data-model → …jobs.completed_at / failed_at / created_at | high |
| confirmCast.entries[].castType | data-model → storyboard_reference_blocks.cast_type ENUM | high |
| confirmCast.entries[].name | data-model → …blocks.name VARCHAR(255) | high |
| confirmCast.entries[].description | data-model → …blocks.description TEXT (nullable) | high |
| confirmCast.entries[].imageFileIds | data-model → proposal_json.image_file_ids (flow pre-fill, AC-03) | high |
| confirmCast.entries[].sceneBlockIds | data-model → storyboard_reference_scene_links.scene_block_id | high |
| confirmCast.entries maxItems 12 | cast size limit (spec §8 OQ-1, sad §4) | high |
| confirmCast.acknowledgedAggregateCredits | spec AC-03 (collective cost confirmation) + repo precedent GenerateRequest.acknowledgedCost; no column — consent record | medium |
| confirmCast.201.items[] | → ReferenceBlock (below) | high |
| ReferenceBlock.blockId / draftId | data-model → …blocks.id / .draft_id | high |
| ReferenceBlock.flowId | data-model → …blocks.flow_id (nullable FK, UNIQUE 1:1; null = no-flow, ADR-0006) | high |
| ReferenceBlock.castType / name / description | data-model → …blocks.cast_type / .name ≤255 / .description | high |
| ReferenceBlock.sortOrder | data-model → …blocks.sort_order (window dispatch order, ADR-0003) | high |
| ReferenceBlock.positionX / positionY | data-model → …blocks.position_x / .position_y (ADR-0005) | high |
| ReferenceBlock.windowStatus | data-model → …blocks.window_status ENUM, nullable (manual block, AC-11) | high |
| ReferenceBlock.errorMessage | data-model → …blocks.error_message VARCHAR(512) (AC-04) | high |
| ReferenceBlock.version | data-model → …blocks.version INT UNSIGNED (CAS guard, Override §1 ¶4) | high |
| ReferenceBlock.sceneBlockIds | data-model → storyboard_reference_scene_links (pivot) | high |
| ReferenceBlock.stars[] | data-model → storyboard_reference_stars rows | high |
| ReferenceBlock.previewFileId | derived — primary star, else earliest star (…stars.created_at note), else null (AC-07 fallback rule); no column | medium |
| ReferenceBlock.createdAt / updatedAt | data-model → …blocks.created_at / .updated_at | high |
| createReferenceBlock.castType / name / description | data-model → …blocks columns (windowStatus stays NULL — AC-11) | high |
| updateReferenceBlock.positionX / positionY | data-model → …blocks.position_x / .position_y; write-path = drift resolution #2 | high |
| retryReferenceBlockGeneration.202.windowStatus | data-model → …blocks.window_status (failed → pending, ADR-0003) | high |
| saveSceneLinks.sceneBlockIds | data-model → storyboard_reference_scene_links.scene_block_id (composite PK) | high |
| saveSceneLinks.version (req+resp) | data-model → …blocks.version (compare-and-set, Flow 5) | high |
| Star.fileId | data-model → storyboard_reference_stars.file_id FK → files | high |
| Star.isPrimary | data-model → …stars.is_primary TINYINT(1)/NULL → wire boolean (1 ⇢ true, NULL ⇢ false) | high |
| Star.createdAt | data-model → …stars.created_at | high |
| starReferenceResult.isPrimary | data-model → …stars.is_primary + uq(block,is_primary) (one primary per block) | high |
| BlockStarsState.* | composition of Star + derived previewFileId | high |
| starGate.422.details.blocks[] | spec AC-08 («names exactly which blocks») → …blocks.id + .name | high |
| DraftBadge.draftId | derived at read — uq_storyboard_reference_blocks_flow JOIN (ADR-0010); no column on flows | high |
| deleteGenerationFlow.confirm | sad §6 Flow 10 (warning → Creator confirms) | high |
| updateMySettings.concurrencyLimit | sad §8 (user_settings.settings_json key, default 4); bounds 1..12 = drift resolution #3 | medium |
| events.cast-extract payload (jobId, draftId, userId) | data-model → …jobs columns | high |
| events.storyboard.cast_extraction.updated.* | …jobs columns; naming per realtime.schema.ts precedent | high |
| events.storyboard.reference_block.updated.* | …blocks columns + derived previewFileId | high |

**Error-code origins** (all proposals for the new domain — see drift point 2):

| code | status | origin | confidence |
|---|---|---|---|
| references.cast_already_confirmed | 409 | spec AC-01b + Flow 8 («дія не пропонується») | high |
| references.extraction_in_progress | 409 | drift resolution #1 (sequence gap) | medium |
| references.script_missing | 422 | inferred from AC-01 Given («draft with a script») | low |
| references.extraction_not_found | 404 | data-model access pattern (latest job for draft) | medium |
| references.no_completed_extraction | 422 | inferred precondition of confirm (Flow 1 ordering) | low |
| references.version_conflict | 409 | Flow 5 alt + NFR concurrency + repo OptimisticLockError(409) | high |
| references.scene_not_in_draft | 422 | inferred integrity of pivot FK (scene must be the draft's) | medium |
| references.file_not_in_flow | 422 | ADR-0009 (stars reference flow result files) | medium |
| references.block_not_failed | 409 | inferred from AC-04/ADR-0003 (retry only failed) | medium |
| references.star_gate_failed | 422 | spec AC-08/AC-08b + ADR-0011 + Flows 2/7 alt; 422 mirrors repo GateError | high |
| flow.rate_limited | 429 | Flow 8 alt — reuses the shared existing creation-limit error (R3, AC-11); drift resolution #5 | high |
| references.draft_not_found / block_not_found | 404 | spec AC-13 + Flow 3 alt (existence hiding) | high |
| flow.linked_to_storyboard_block | 409 | spec AC-12 + Flow 10 (warning branch) | high |

A `low` row is **declared incompleteness**, not an error — `--reconcile` tightens it when
`implement` pins the real codes in `apps/api/src/lib/errors.ts`.

## Section B — drift findings (4-point checklist)

1. **Endpoint ↔ data-model** *(core)* — ✓. Every operation reads/writes ≥1 entity:
   extract/getExtraction → `storyboard_cast_extraction_jobs`; confirm → all four tables;
   blocks list/create/patch/delete/retry → `storyboard_reference_blocks` (+ pivot, + stars);
   scene-links → `storyboard_reference_scene_links` + `…blocks.version`; stars →
   `storyboard_reference_stars`; extensions → `…blocks` via the flow link / window settings.
   No orphan entity: all four data-model tables are reachable from the contract.
2. **Error code ↔ repo error definition** *(core)* — ✓ with note. Repo form detected: typed error
   classes in `apps/api/src/lib/errors.ts` (statusCode + optional machine `code`, GateError
   pattern carrying `{code, details}` — precedent codes `flow.required_input_missing` etc.).
   The `references.*` codes do not exist there yet — **expected for a new domain**; recorded as
   the contract's proposal per drift-check guidance («codes are the contract's proposal;
   reconcile when the repo defines them»). Status mapping follows the repo classes:
   gate → 422 (GateError), CAS conflict → 409 (OptimisticLockError), rate limit → 429
   (RateLimitedError), existence hiding → 404 (NotFoundError).
3. **Validation ↔ constraint** *(core)* — ✓. `name` maxLength 255 = VARCHAR(255); `errorMessage`
   maxLength 512 = VARCHAR(512); `castType`/`status`/`windowStatus` enums = ENUM columns verbatim
   (windowStatus additionally nullable per column); `version` integer ≥1 = INT UNSIGNED DEFAULT 1;
   proposal/entries maxItems 12 = cast size limit; star uniqueness (block+file, one primary) =
   the two UNIQUE indexes; `description` deliberately unbounded (TEXT). No spec-vs-model
   constraint conflict found.
4. **OpenAPI ↔ sequence** *(supporting)* — ✓. All §6 alt-branches map to responses:
   Flow 1 alt (per-block failure) → events + `windowStatus: failed` + retry endpoint;
   Flow 2/7 alt (gate) → 422 `references.star_gate_failed` (full + scoped); Flow 3 alt
   (non-owner) → 404 existence-hiding on every operation; Flow 4 both branches →
   `BlockStarsState.previewFileId` (fileId | null); Flow 5 alt (version) → 409; Flow 8 alt
   (rate limit) → 429; Flow 10 cancel/confirm → 409 + `?confirm=true`. One response exists
   beyond the sequences — 409 `extraction_in_progress` (resolution #1, recorded above, not drawn
   in §6; flagged for a future `sequences` touch-up, non-blocking).

**Verdict: 4/4 ✓ — no unresolved core finding. All 5 flags resolved in-run (table above).**

## Back-feed coverage cross-check

Every §5 AC ↔ ≥1 operation/response; every operation ↔ a §4 user story.

| AC | Covered by |
|---|---|
| AC-01 | POST …/extract (202) + GET …/extraction (proposal correctable in the modal) |
| AC-01b | POST …/extract → 409 `references.cast_already_confirmed` |
| AC-02 | `proposal` maxItems 12 + trim rule in events.md (worker behaviour) |
| AC-03 | POST …/confirm (201, rolling window) + settings `concurrencyLimit` |
| AC-04 | `windowStatus/errorMessage` + `storyboard.reference_block.updated` + POST …/retry; gate message names the no-result block (star_gate_failed details) |
| AC-05 | GET …/blocks (`flowId`) → existing GET /generation-flows/{flowId}; «back to storyboard» is client-side navigation (no API surface needed) |
| AC-06 | PUT …/stars/{fileId} (isPrimary → previewFileId) |
| AC-07 | DELETE …/stars/{fileId} → BlockStarsState fallback (both branches); file-delete cascade noted in events.md |
| AC-08 | POST /storyboards/{draftId}/illustrations → 422 star_gate_failed (extension) |
| AC-08b | POST …/blocks/{blockId}/illustration → scoped 422 (extension); zero-blocks pass documented |
| AC-09 | **No HTTP surface by design** — worker-internal reference boundary (DB reads at generation time, ADR-0007/0008); contract home = events.md `ai-generate` section. Not an orphan. |
| AC-10 | PUT …/scene-links (200 + version) |
| AC-10b | **No contract change by design** — FK cascade on scene delete (migration 03), no links on add, position-independent links; existing scene endpoints unchanged. |
| AC-11 | POST …/references/blocks (201, no charge, 429 branch) |
| AC-12 | GET /generation-flows `draftBadge` + DELETE /generation-flows/{flowId} 409 + `confirm` |
| AC-13 | 404 existence-hiding responses on every operation (DraftNotFound/BlockNotFound) |
| AC-14 | DELETE …/references/blocks/{blockId} (204 — flow survives) |
| AC-14b | **No contract change by design** — existing draft delete; survival via FK topology (blocks CASCADE, flow link severed, flows untouched). Behaviour note in openapi delete-block description. |

Every operation maps to a US: extract/extraction/confirm → US-01/US-02; blocks GET → US-03/US-06;
blocks POST → US-07; PATCH → canvas placement (resolution #2, serves US-03's canvas); DELETE +
flow-delete extension → US-08; retry → US-02 (AC-04); scene-links → US-05; stars → US-04;
illustration extensions → US-06; settings extension → US-02 (AC-03). No orphan endpoint.

## Follow-ups (non-blocking)

- `sequences` touch-up (optional): draw the `extraction_in_progress` branch and the block-drag
  save into §6 next time the SAD is opened — the contract currently carries them from the drift
  dialog, not a diagram.
- `implement`: pin the `references.*` error classes in `apps/api/src/lib/errors.ts` and the two
  realtime event schemas in `packages/project-schema` — then run `/sdd:api
  storyboard-reference-flows --reconcile` to lift the `low` confidence rows.
- Spectral lint is not wired in the repo's check target yet; suggested:
  `npx @stoplight/spectral-cli lint docs/features/storyboard-reference-flows/contracts/openapi.yaml`.
