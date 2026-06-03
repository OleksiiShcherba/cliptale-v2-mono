---
status: Draft
owner: "QA + implementing engineer"
reviewers: ["Implementing engineer", "Tech Lead"]
updated_at: "2026-06-03"
feature_size: "L"
---

# Test plan — generate-ai-flow

A Creator assembles content + generation blocks on a node canvas, draws typed (modality-matched) connections, presses **Generate** one block at a time after a cost confirmation, and every successful result is saved to the general library linked to the flow. Validation, the cost gate, and the per-Creator rate limit are **server-authoritative**; flows are owner-scoped. This plan maps every spec.md §5 acceptance criterion (AC-01 … AC-19) to at least one named test.

> Derived from `spec.md` §5/§6, `sad.md` §6 (Flows 1–9) + `target_surfaces: [web-frontend, backend-service, worker]`, and `data-model.md` (entities + fixtures). `implement` reads this map and writes the red tests against it — it does not re-decide levels.

## Levels

The UI tiers (component / visual-regression / e2e-through-UI) apply because `sad.md` declares `target_surfaces` with `web-frontend`. `implement` picks the concrete runner/tool per level from what the repo already uses (Vitest, @xyflow/react test utils, Playwright, etc.).

| Level | Scope | Strategy (generic — no tool names) |
|---|---|---|
| Unit | Pure logic with no I/O: modality-match rule, alternative-exclusivity (XOR) rule, required-input resolution, content empty/invalid validation, single-result keep-first, model-change handle reconciliation, static cost lookup. | In-memory, no external dependency. |
| Integration | The `api` services + repositories against a real MySQL 8 they own (flow CRUD, optimistic version, owner scoping, flow_files CASCADE/RESTRICT, jobs.flow_id link), and the `media-worker` outcome path against MySQL + S3-shape. | **The repo's existing real-MySQL harness** (Vitest, `singleFork` — one file's tests run serially in one process so they don't trample the shared DB); **per-test cleanup** (truncate/rollback the seeded rows after each test). NOT a mocked datastore. |
| Contract | The `web ↔ api` REST shapes (flow CRUD, cost-estimate, Generate) against the hand-maintained OpenAPI, and the `api ↔ media-worker` extended ai-generate job payload (`flow_id`/`block_id`) against its Zod schema. | Validate the real request/response + payload against the agreed schema; no hand-rolled stubs. |
| E2E-through-UI | The three critical user-story flows driven through the real rendered UI (browser): Generate happy path, durability (reopen + reattach), two-tab conflict. | The flow exercised through the rendered canvas against ephemeral dependencies; the AI provider is a deterministic stub so the async outcome is reproducible. |
| Component | A UI piece exercised in isolation: a generation node's input handles, the connection-drop gate, the result node's progressive/dominant-preview layout, the inspector, the cost-confirm modal, the failed-state + retry, the model-change removed-connections notice. | Render in a component harness; assert output + interaction; no full app boot. |
| Visual-regression | The result node's "dominant media area" layout (AC-08) diffed against an approved baseline — the one AC that is fundamentally about rendered proportion, not behaviour. | Snapshot the rendered node; fail on an unintended visual diff; update the baseline deliberately. |
| Load | Numeric §6 latency NFRs that scale with server load. | The load tool already in the repo, or e.g. k6 / Locust. |

## AC coverage

Every §5 AC maps to ≥1 row. E2E-through-UI is reserved for the three SAD §10 quality-goal flows (Generate happy path, durability, conflict); all other UI behaviour is covered at component level + API integration.

| AC (spec.md §5) | Test name (intent-based) | Level | Expected outcome |
|---|---|---|---|
| **AC-01** — happy path (text→image Generate) | satisfied image-generate produces a result block and a linked library asset | integration + e2e-through-UI | After cost confirm, a new connected result block is created (prior runs kept), the image is produced, shown in the block, and added to the owner's library linked to this flow. |
| **AC-15** — happy path (assemble blocks) | added blocks render the selected model's required handles and persist | component + integration | Content + generation blocks appear; the generation block shows input handles for the chosen model's required inputs; the additions are saved into the flow canvas. |
| **AC-16** — happy path (provide content + params) | supplied content and inspector parameters are retained and reused | component + integration | Typed text / uploaded / library-picked media and edited optional params are retained on the blocks and used on the next Generate. |
| **AC-02** — domain invariant (connect-time compatibility) | text→image-handle connection is refused at drop | unit + component | The modality-mismatch rule rejects the connection; the UI refuses the drop and indicates the handle expects an image, not text; no edge is created. |
| **AC-03** — error (missing required input) | Generate with an unconnected required input is blocked before any provider call | unit + integration | Server re-validation blocks the run, no job enqueued, the Creator is told which required input must be connected first. |
| **AC-04** — authorization (non-owner) | non-owner flow access is denied without existence disclosure | integration | Every flow open/list/save/delete/Generate by a non-owner returns the not-found outcome — no flow contents, no existence signal. |
| **AC-05** — cross-context (missing library asset) | Generate on a block referencing a vanished previously-owned asset is blocked | unit + integration | Run blocked before any provider call; the Creator is told the referenced (previously-owned) asset is missing and must be replaced; a never-owned asset is denied as not-found per AC-04 without revealing existence. |
| **AC-06** — domain invariant (alternative-input exclusivity) | Generate with both-or-neither of an exclusive pair is blocked | unit + integration | The XOR rule blocks the run before any provider call and tells the Creator exactly one of the two alternatives must be provided. |
| **AC-07** — domain invariant (model change reconciles handles) | changing the model rebuilds handles, prunes incompatible edges, preserves the result | unit + component | Input handles rebuild for the new model; now-incompatible connections are removed with the removed list shown; any existing result block + its library linkage are preserved (only input edges change). |
| **AC-08** — happy path (async progress + dominant preview) | running shows live progress; completed shows media as the dominant block area | component + visual-regression | While running the block shows live progress; on completion the produced media occupies the majority of the block (image large preview / video / audio large player), controls + labels secondary. |
| **AC-08b** — async edge (tab closed mid-generation) | reopening a flow reattaches to or shows the last-known outcome of an in-flight job | integration + e2e-through-UI | On reopen the result block reattaches to live progress, or shows a completed result (now in the library), or shows the AC-09 failed state with retry — outcome never lost because the Creator left. |
| **AC-09** — error (failed / charged-but-empty) | a failed generation shows a retry state and links no library asset | integration + component | The result block shows a plain-language failed state with a retry option; no broken/empty asset is added to the library; retry is a fresh, cost-confirmed, rate-limited Generate. |
| **AC-10** — happy path (flow lifecycle persists) | reopening a flow restores blocks, connections, params, and prior results | integration + e2e-through-UI | The canvas restores with the same blocks, connections, parameters, and previously produced results in their result blocks. |
| **AC-10b** — concurrency edge (same flow in two tabs) | the second conflicting save is rejected and the first stays authoritative | integration + e2e-through-UI | A stale-version save is rejected (conflict), the Creator is warned to reload, the first save's state stays authoritative; the other tab's changes are never silently overwritten. |
| **AC-11** — error (cost confirmation gate) | cancelling the cost confirmation makes no paid call and changes nothing | component + integration | No provider call, no result-block content, no library asset, no charge; the flow is unchanged. |
| **AC-12** — happy path (audio generation) | a satisfied audio-generate produces a playable result and links it to the library | integration | Audio is produced into a connected result block (playable on completion) and added to the owner's library linked to the flow — first-class, same path as image/video. |
| **AC-13** — happy path (video generation, image→video) | a satisfied image→video generate produces a playable video result | integration | Video is produced into a connected result block (playable on completion) and added to the owner's library linked to the flow. |
| **AC-14** — domain invariant (single result per Generate) | a multi-output model run keeps exactly one result and links one asset | unit + integration | The worker keeps the first output and discards extras; exactly one result block and exactly one library asset result from one Generate. |
| **AC-17** — error (empty / invalid content block) | Generate from an empty or invalid content block is blocked before any provider call | unit + integration | Run blocked before any provider call; the Creator is told which content block is empty (no text) or invalid (unsupported file type/size) and must be fixed first. |
| **AC-18** — happy path (reuse a result as input) | a result block's output connects into a compatible handle and is reused on next Generate | unit + component | The modality-matched connection from a result output is accepted; on the next Generate of the second block the produced result is used as that input — no library re-import. |
| **AC-19** — cross-context (delete flow preserves assets) | deleting a flow drops its links but keeps the library assets | integration | The flow + its blocks/connections are removed and the `flow_files` links dropped, but the generated `files` assets remain in the owner's library (CASCADE on the link, RESTRICT on the asset). |

## Edge cases / error paths

Each error / authorization AC above already has its own dedicated row. Additional boundary + failure cases the spec and §6 sequences imply:

- **Generate scripted past the rate limit (spec §6, §6.1, Flow 7)** → expected: server rejects once > 30 runs/min/Creator regardless of the UI; the UI confirmation cannot be bypassed. (integration — direct API calls past the cap.)
- **Generate request carrying a stale flow version (Flow 4 / Flow 7)** → expected: rejected as a conflict before any provider call; the Creator must reload (same idiom as AC-10b autosave).
- **Cross-Creator Generate on another's flow (Flow 7, §8 owner-scope)** → expected: not-found outcome, no provider call, no existence disclosure.
- **Duplicate / redelivered ai-generate job (Flow 8 idempotency flag)** → expected: the idempotency key makes the worker skip an already-processed job — no double charge, no duplicate asset. (integration — re-deliver the same `jobId`.)
- **Provider transient failure then success within retry budget (Flow 8)** → expected: the job retries with backoff and completes; exactly one asset linked on eventual success.
- **Retries exhausted (Flow 8 dead-letter)** → expected: after N attempts the job is dead-lettered and surfaced as the AC-09 failed state with retry; no asset linked.
- **Malformed Generate / save payload (bad shape, non-UUID id)** → expected: rejected as a bad-request before any owner or provider work. (contract + integration.)
- **Connection-feedback latency (spec §6, ≤100 ms; SAD §10 QG-4)** → expected: accept/reject visual within p95 ≤ 100 ms, driven by client-side catalog modality data with **no server round-trip**. Verified as a **client interaction metric**, not a load test (see NFR section).

## Test data

- **Seed strategy:** factories matching `data-model.md` entities — a `generation_flows` row (hardcoded UUID ids, a minimal valid `canvas` JSON document, `version = 1`, `user_id` = the seeded test Creator); for AC-01/12/13/19 a `files` row + a `flow_files` link; for the worker path an `ai_generation_jobs` row carrying `flow_id`/`block_id`. The model catalog (with the ADR-0006 `modality` + `exclusiveGroup` fields) is the in-code fixture for the unit modality/XOR rules.
- **PII guard:** any user/email in fixtures uses `user-<uuid>@example.test` / `Test Creator` — never real-looking data (per `data-model.md` §Seeds).
- **Integration dependency:** the repo's **existing real MySQL 8** harness (Vitest `singleFork`), NOT a mocked store — FK CASCADE/RESTRICT (AC-19) and the optimistic-version conflict (AC-10b) can only be verified against the real engine. S3 + the AI provider are stubbed at their client boundary (deterministic outputs); MySQL and Redis (rate-limit counter, queue) are real.
- **Cleanup boundary:** **per-test** — truncate/rollback the seeded `generation_flows` / `flow_files` / `files` / `ai_generation_jobs` rows and reset the Redis rate-limit counter after each test, so tests sharing the one DB stay independent and the suite does not go flaky.

## NFR validation (load)

Load scenarios cover only the §6 numeric targets that scale with **server** load. The connection-feedback target is a client-render metric (no server path) and the rate limit is a correctness gate — both verified elsewhere, noted here so no numeric NFR is silently dropped.

- **Open a saved flow — p95 ≤ 1500 ms (typical flow ≈ ≤50 blocks, spec §8 default):** sustain a target rate of concurrent flow-open requests for a fixed duration against a seeded typical-size flow; assert read-path p95 ≤ 1500 ms (exercises `idx_generation_flows_user_active_updated` + the canvas read).
- **Flow autosave acknowledged — p95 ≤ 800 ms:** sustain a steady rate of canvas autosave (version-carrying) requests for a fixed duration; assert ack p95 ≤ 800 ms with no error-rate regression.
- **Generation rate limit — ≤ 30 runs/min/Creator (spec §6):** verified by an **integration** test (script the Generate API past 30/min → rejected), not a load scenario — it is a server-authoritative correctness gate, not a throughput target.
- **Connection-feedback p95 ≤ 100 ms (spec §6, SAD §10 QG-4):** verified by a **client interaction metric** on the connect gesture — purely client-side render off the catalog, no server round-trip, so a load tool would misrepresent it. <!-- intentionally not a load scenario -->
- **Availability 99.5% (spec §6):** monitored as a monthly SLO (SAD §7), not a pre-release load test. <!-- N/A as a load scenario: SLO, not a throughput target -->

## CI placement

Advice only — `implement` and the repo's CI own the real wiring.

- **On every PR (fast):** unit, contract, component, visual-regression — and the API integration suite (the repo already runs Vitest against real MySQL in `singleFork`).
- **On schedule / pre-release (heavier):** the three e2e-through-UI flows and the two load scenarios.
