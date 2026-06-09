# api-sync-report — scene-generation-reference-gate (2026-06-09)

Contract: [`openapi.yaml`](./openapi.yaml) + [`events.md`](./events.md) (async Flow 3).
Interface kind: **HTTP delta + events** — read from `sad.md` frontmatter
`target_surfaces: [backend-service, web-frontend, worker]` (ADR-0001; not re-derived).
`web-frontend` consumes this contract, authors nothing. Size `M` → full surface.
Inputs found: `data-model.md` ✓, `sad.md` §6 (Flows 1–6) ✓, `spec.md` §4/§5 ✓, `CONTEXT.md` ✓,
ADR-0001…0004 ✓. Predecessor contract (`storyboard-reference-flows/contracts/`) used as the
brownfield-convention precedent (error envelope, camelCase, rooted paths — team decision
2026-06-03/2026-06-07, inherited verbatim).

**Zero new endpoints.** The contract is a delta over four existing surfaces: the two start
operations (gate replaced), the status read (principal fields removed), four principal-image
routes (removed). The predecessor's `references.star_gate_failed` is retired with the star gate.

## Section A — field origins

| schema_path | origin | confidence |
|---|---|---|
| startStoryboardIllustrations.202 / listStoryboardIllustrations.200 → `StoryboardIllustrationStatus` | existing wire type `storyboardIllustration.types.ts` minus `reference` (AC-08 delta) | high |
| `StoryboardAutomationStatus.phase` | existing enum minus `creating_principal_image`, `awaiting_principal_approval` (AC-08) | high |
| `StoryboardAutomationStatus.planningJobId`, `.errorMessage` | existing wire type, unchanged | high |
| `SceneIllustrationStatusItem.blockId` | data-model.md → storyboard_blocks.id (CHAR(36) PK) | high |
| `SceneIllustrationStatusItem.status` | existing repo enum `storyboardSceneIllustration.repository.ts` (queued/running/ready/failed) | high |
| `SceneIllustrationStatusItem.jobId`, `.outputFileId`, `.errorMessage` | existing wire type; outputFileId → files.file_id | high |
| `Error.error` / `.code` / `.details` | repo envelope (predecessor precedent: `{error}` + additive `{code, details}`) | high |
| 422.details.`blocks[].blockId` | data-model.md → storyboard_reference_blocks.id (CHAR(36) PK) | high |
| 422.details.`blocks[].name` | data-model.md → storyboard_reference_blocks.name (VARCHAR(255) NOT NULL → maxLength 255) | high |
| 422.details.`scenes[].blockId` | data-model.md → storyboard_blocks.id (block_type='scene') | high |
| 422.details.`scenes[].name` | migration 031 → storyboard_blocks.name (VARCHAR(255) NULL → type [string, null], maxLength 255) | high |
| `references.reference_gate_failed` (code) | derived: Flow 1/2 alt-branch «блок not-ready» + AC-02/AC-03b/AC-07; replaces retired `references.star_gate_failed` | medium — contract proposal, see B-2 |
| `references.unlinked_scenes` (code) | derived: Flow 1 alt-branch «сцена без лінка» + AC-04b | medium — contract proposal, see B-2 |
| `references.draft_not_found`, `references.scene_not_in_draft` (codes) | reused from predecessor contract | high |
| DraftId / SceneBlockId params | data-model.md → generation_drafts.id / storyboard_blocks.id | high |

No field was invented without an origin; no field was silently dropped — the removed `reference`
object and the two removed `phase` values are the **deliberate AC-08 delta**, made contractual via
`additionalProperties: false` and recorded here (not `# stale`: the column source lives on, only
the wire projection retires).

## Section B — drift findings

1. **Endpoint ↔ data-model** *(core)* — ✓. Both start operations evaluate Q1–Q3 (gate) and
   enqueue scene jobs that read Q4–Q7 (selection + boundary); the status read projects
   scene-job rows; the removed routes wrote only the deprecated
   `storyboard_illustration_references` (deferred DROP). Every operation maps to a §4 story
   (table below).
2. **Error code ↔ repo error definition** *(core)* — ✓ with the standing note: the repo has no
   central error registry; services throw typed classes (`UnprocessableEntityError`) with
   message-only bodies. Codes are the **contract's additive proposal** — the exact resolution
   the predecessor recorded (team decision 2026-06-03) and shipped with; the two new codes
   (`references.reference_gate_failed`, `references.unlinked_scenes`) follow the same neutral
   `module.error_name` convention and are marked medium-confidence in Section A. Reconcile
   when/if the repo gains a registry.
3. **Validation ↔ constraint** *(core)* — ✓. maxLength 255 ← VARCHAR(255) (both name columns);
   nullability 3.1-style (`type: [string, "null"]`) matches DDL NULL-ability; enums match the
   repo row-type unions verbatim; UUID format ← CHAR(36) convention. No spec↔model constraint
   conflict found.
4. **OpenAPI ↔ sequence** *(supporting)* — ✓. Branch map:

   | sad §6 branch | Contract response |
   |---|---|
   | Flow 1 alt «блок not-ready» (+ Flow 4 still-generating) | POST /illustrations → 422 `references.reference_gate_failed` |
   | Flow 1 alt «сцена без лінка» | POST /illustrations → 422 `references.unlinked_scenes` |
   | Flow 1 «нуль блоків / всі ready і лінковані» (+ Flow 5 pass) | POST /illustrations → 202 |
   | Flow 2 alt «лінкований блок not-ready» | POST /blocks/{id}/illustration → 422 (scoped) |
   | Flow 2 «усі лінковані ready» | POST /blocks/{id}/illustration → 202 |
   | Flow 3 (worker: selection, boundary, retry, DLQ, realtime) | events.md (no HTTP surface) |
   | Flow 5 «гейт не пройдено» | same 422s as Flow 1 (shared branch) |
   | Flow 6 «не власник» | 404 `references.draft_not_found` (no state disclosure, AC-09) |

   One supporting note: the **status read** (GET /illustrations) appears in no §6 flow — it has
   no new branching (response reshape only), its delta derives from AC-08 + spec §6 NFR
   (p95 ≤ 300 ms) and the existing wire type. Not a blocking gap; recorded as a follow-up
   observation, no sequence redraw needed.

**Core findings: 3/3 ✓, flags: 1 supporting note** → під порогом паузи; run not paused.

## Back-feed — coverage cross-check

Every §5 AC → ≥1 operation/response; every operation → §4 story + ≥1 AC:

| AC | Operation / response |
|---|---|
| AC-01 | POST /illustrations → 202 |
| AC-02 | POST /illustrations → 422 `reference_gate_failed` (named blocks + existing retry/remove actions) |
| AC-03 | POST /blocks/{id}/illustration → 202 |
| AC-03b | POST /blocks/{id}/illustration → 422 (scoped naming) |
| AC-04 | POST /illustrations → 202 (zero-reference branch, description) |
| AC-04b | POST /illustrations → 422 `unlinked_scenes` |
| AC-05 | no HTTP surface — worker boundary read (events.md «Delta — worker reads» п.1); invariant tested per spec §6 |
| AC-06 / AC-06b | no HTTP surface — worker selection (events.md п.2, ADR-0003) |
| AC-07 | POST /illustrations → 422 `reference_gate_failed` (persisted-read semantics in description + events.md «NOT an event») |
| AC-08 | GET /illustrations revised schema + 4 routes removed (tag `removals`) + events.md payload delta |
| AC-09 | 404 `references.draft_not_found` on both starts + GET (ownership before gate, response description) |

| Operation | §4 story |
|---|---|
| POST /storyboards/{draftId}/illustrations | US-01, US-02, US-04, US-05 (AC-04b), US-07 |
| POST /storyboards/{draftId}/blocks/{blockId}/illustration | US-03, US-06 (selection consumed worker-side) |
| GET /storyboards/{draftId}/illustrations | US-07 / AC-08 (+ spec §6 NFR status read) |
| 4 × principal-image removals | US-07 / AC-08 |

No orphan sequence, no AC without a surface, no operation without a story.

## Deviations & decisions recorded this run

- **Brownfield envelope/casing/paths** — inherited from predecessor contract (not the SDD
  defaults); rationale documented in the YAML header.
- **No `Idempotency-Key` on the start endpoints** — they keep the repo's natural active-job
  dedupe (`isActiveIllustrationStatus`); matches the predecessor's handling of these same two
  endpoints («extensions documented only where extended»). TTL question therefore N/A.
- **Removed routes answer 404** (router deletion, standard Express fall-through) — documented
  as `deprecated: true` + `RouteRemoved` so consumers see the removal in the diff; no 410
  stub is built.
- **`references.star_gate_failed` retired** — superseded by `references.reference_gate_failed`;
  a web-editor consumer keying on the old code must migrate (flagged for `sdd:tasks`).
- **No pagination** anywhere — no list endpoint is added; the status read keeps its existing
  canvas-load (full set) semantics, predecessor precedent.

## Lint

`spectral` не знайдено в репо (`package.json` scripts — відсутній); рекомендована перевірка:
`npx @stoplight/spectral-cli lint docs/features/scene-generation-reference-gate/contracts/openapi.yaml`.
Wiring a repo-wide check target — поза скоупом цього прогона (нотатка для `sdd:tasks`).
