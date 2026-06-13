---
status: Draft
owner: "QA + Backend Lead"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-06-13"
feature_size: "L"
---

# Test plan — storyboard-generation-pipeline

Backend-owned, resumable, sequential pipeline state machine that walks a draft through four ordered
phases (scene → reference-data → reference-image → scene-image), each behind a full-screen blocking
loader or a review modal, with every transition / cancel / skip / re-trigger decided and persisted
server-side. The frontend renders whatever the pipeline reports. This plan maps every spec.md §5
acceptance criterion (AC-01…AC-15) to ≥1 named test before any test is written.

## Levels

| Level | Scope | Strategy (generic — no tool names) |
|---|---|---|
| Unit | Pure logic: a transition rule, a phase-order check, a "Ready linked reference" predicate, a no-progress-age calc — no I/O. | In-memory, no external dependency. |
| Integration | The pipeline service / repository / worker against the real MySQL it coordinates (the `storyboard_pipeline` row + the coordinated block/job tables). | An ephemeral real DB (throwaway MySQL spun up per suite), inline seeded; NOT a mocked store. |
| Contract | The boundary between Web ↔ Api (resume-read + trigger/cancel/skip/confirm shapes in `contracts/openapi.yaml`) and Api/Worker ↔ Web (realtime convergence event schema in `contracts/events.md`). | Validate the real response/event shape against the agreed contract; no hand-rolled stubs. |
| E2E | One full orchestration flow end to end, **driven through the real API entry point** (Api + Worker + real DB), per owner decision. | The flow exercised through real endpoints against ephemeral dependencies. |
| Component *(UI surface)* | The full-screen loader and the Review-cast / scene-image-offer modals in isolation: props/state → render + interactions. | Render in a component harness; assert output + behaviour, no full app boot. |
| Visual-regression *(web UI)* | The rendered full-screen loader and review modals diffed against an approved baseline. | Snapshot the render; fail on an unintended visual diff; update the baseline deliberately. |
| E2E-through-UI *(UI surface)* | The resume story (AC-05) and the happy-path a→s flow driven through the rendered UI, not just the API. | The flow exercised through the rendered UI against ephemeral dependencies. |
| Load | <!-- N/A by owner decision (2026-06-13): the numeric §6 NFRs are validated by time-controlled integration tests, not a dedicated load tool — see "NFR validation" below. --> |

## AC coverage

Every acceptance criterion maps to ≥1 row. Levels are the owner's authoritative choices
(2026-06-13). SAD §6 flow that each AC traces to is noted for the implementer.

| AC (spec.md §5) | Test name (intent-based) | Level | Expected outcome |
|---|---|---|---|
| AC-01 (US-01) happy — auto-start scene gen | opening Step 2 on an unplanned draft auto-starts scene generation behind the loader and advances on completion | integration + e2e | scene generation begins, full-screen loader labelled for scenes is shown, scene blocks recorded, pipeline advances to reference-data (SAD Flow 1) |
| AC-02 (US-02) happy — reference-data → cast modal | finishing scene gen runs reference-data behind the loader and presents the Review-cast proposal | integration + e2e | reference-data runs behind the loader, then the Review-cast modal appears with each proposed reference showing its AI-selected scenes (SAD Flow 1) |
| AC-03 (US-03) happy — confirm cast → refs below music → ref-image → offer | confirming the cast creates reference blocks below music, generates one image per reference, and presents the scene-image offer | integration + e2e | every reference block created below all music, ref-image gen runs, once every reference reaches a terminal result the scene-image offer (with cost estimate) appears; a failed reference is tolerated and does not fail the phase (SAD Flow 1/6) |
| AC-04 (US-04) happy — accept scene-image, tolerate per-scene fail | accepting scene-image generation illustrates every scene and completes even if some scenes fail | integration + e2e | each scene's image generated behind the loader; once every scene reaches a terminal result, successful scene images recorded, phase reported completed even with some scenes failed; failed scenes left re-triggerable (SAD Flow 1/7) |
| AC-05 (US-05) happy — resume + observer convergence | reopening Step 2 reconstructs the exact running loader or pending modal from backend state; a second tab converges | integration + e2e-through-UI | reopened client shows the same running loader / pending modal rebuilt from backend state, underlying work continued uninterrupted, and any other tab converges to the same state within the resume-freshness bound (SAD Flow 2) |
| AC-06 (US-06) happy — cancel keeps results, incremental re-trigger | cancelling a running phase keeps finished results and re-triggers only the unfinished units | integration + e2e | phase stops, no further work enqueued, every produced result kept, phase returns to idle; on re-trigger only unfinished units regenerate, completed units untouched and not re-charged (SAD Flow 3) |
| AC-07 (US-07) happy — skip records `skipped`≠`idle` | dismissing a review modal records the phase as skipped, distinct from never-run, and keeps it triggerable | unit + integration | the phase is recorded `skipped` (distinguishable from `idle` by a prerequisite check) and remains available to trigger later from the corner controls (SAD Flow 4) |
| AC-08 (US-07) invariant — phase-order guard | triggering a later phase before scene generation completes is blocked in plain language | unit + integration | the trigger is blocked and the Creator is told the earlier phase must complete first (strict order) (SAD Flow 5) |
| AC-09 (US-03) invariant — reference-below-music ordering | confirming a cast on a draft with music orders every created reference block below every music block, as a creation-time snapshot | integration | every created reference block's recorded order is below every music block; ordering is a snapshot fixed at creation time and not reactively re-ordered (SAD Flow 6) |
| AC-10 (US-08) cross-context — references feed scene images | a scene linked to Ready references is illustrated from its text plus the selected reference outputs and any attached image | integration | the scene's image is generated from its text prompt + the selected reference outputs of its linked Ready references + any directly-attached image (SAD Flow 7) |
| AC-11 (US-08) cross-context — text-only fallback | a scene with no Ready linked reference is illustrated from text alone without blocking the batch | unit + integration | the scene is generated from text (plus any attached image); a link without a Ready output is treated as no reference; the batch is not blocked (SAD Flow 7) |
| AC-12 (US-06) error — stuck/failed phase releases the Creator | a phase that fails or makes no progress past its bound is marked failed and releases the loader with a retry option | unit + integration | the phase is marked failed, the blocking loader released, the Creator told what failed with a retry option; an individual failed unit in an otherwise-progressing batch does NOT trigger this path (SAD Flow 2) |
| AC-13 (US-05) authorization — deny-and-hide | a non-owner reading state or starting/cancelling/skipping/triggering any phase is denied without revealing the draft | integration | the action is denied and neither the draft's existence nor its pipeline state is revealed; authorization is evaluated before any prerequisite/ordering check (SAD Cross-cutting) |
| AC-14 (US-07) invariant — single active run / idempotent re-trigger | a repeated confirm, double trigger, or second-tab trigger neither starts a duplicate run nor creates a duplicate reference-block set | integration | no duplicate run started and no duplicate reference-block set created; the existing run is continued or returned (SAD Flow 6) |
| AC-15 (US-04) error — manual scene-image trigger, prerequisites unmet | using the corner control for scene-image generation with no scenes yet is blocked with an explanation | unit + integration | the action is blocked and the Creator is told scenes must be generated first (SAD Flow 5) |

**UI-surface coverage (web-frontend, owner-selected):**

| UI test | Level | Expected outcome |
|---|---|---|
| Full-screen blocking loader renders with the correct phase label and exposes the cancel affordance | component | loader shows the per-phase label (scene / reference-data / reference-image / scene-image) and a working cancel control |
| Review-cast proposal modal renders each proposed reference with its AI-selected scenes and the reference-image cost estimate; confirm + dismiss wired | component | modal lists proposals + scenes, shows the cost estimate, fires confirm (AC-03) and dismiss/skip (AC-07) |
| Scene-image offer modal renders the precomputed cost estimate with accept + dismiss | component | modal shows the scene-image cost estimate, fires accept (AC-04) and dismiss/skip (AC-07) |
| Loader + both modals match their approved visual baseline | visual-regression | no unintended visual diff against the baseline for the full-screen loader and the two review modals |
| Happy-path a→s flow driven through the rendered UI | e2e-through-UI | a Creator goes empty-draft → illustrated scenes through the real UI (covers AC-01→04 from the user's seat) |
| Resume story driven through the rendered UI | e2e-through-UI | closing/reloading mid-phase and reopening shows the same loader/modal rebuilt from backend state (AC-05) |

## Edge cases / error paths

Each error / authorization AC has its own dedicated row above. Additional boundaries the spec implies:

- Non-owner reads pipeline state of a draft (resume probing) → expected: denied as cross-tenant, draft existence and state not revealed (AC-13).
- Non-owner triggers a phase on a draft whose prerequisites are unmet → expected: opaque deny-and-hide (AC-13), **never** the prerequisite-specific message of AC-08/AC-15 (authz evaluated first — spec §6.1).
- Whole phase exceeds the no-progress bound (heartbeat stale) → expected: phase marked failed, loader released, retry offered (AC-12).
- A single unit fails inside an otherwise-progressing batch → expected: phase still completes, the unit recorded failed and re-triggerable; AC-12 path NOT triggered (AC-03, AC-04).
- Reference ends in failure before the phase finishes → expected: phase still advances; that reference's linked scenes fall back to text-only at scene-image time (AC-03 → AC-11).
- Scene links only to non-Ready (failed / cancelled / skipped) references → expected: treated as no reference, generated text-only, batch not blocked (AC-11).
- Cancel interleaved with an in-flight job (cancel race) → expected: cancel is authoritative, no work enqueued after it takes effect, produced results kept (AC-06; §6.1 cancel-spam).
- Repeated confirm / double trigger / second-tab trigger (CAS race) → expected: existing run continued or returned, zero duplicate reference-block sets (AC-14; §6.1 spam re-trigger).
- Client-tampered cost estimate sent on confirm → expected: estimate recomputed and re-validated server-side, client value not trusted (§6.1 cost-estimate manipulation).
- Re-trigger after cancel on a partially-complete phase → expected: only unfinished units regenerate, completed units untouched and not re-charged (AC-06).
- Manual trigger of any later phase from corner controls before its prerequisite phase completed → expected: blocked with a plain-language order message (AC-08, AC-15).

## Test data

- **Seed strategy:** inline per-test inserts (raw `mysql2` INSERTs with `node:crypto` `randomUUID()`, suite-unique prefixes), matching the repo's existing pattern — there is no shared factory module. Use the data-model.md fixtures: `insertPipelineRow`, `insertRunningPhase`, `insertStuckPhase` (heartbeat aged past the 10-min bound), `insertAwaitingReview`; reuse the existing draft/user/scene/music/reference inline inserters from `storyboardReference.repository.test.ts` for the coordinated-table assertions (AC-09/10/11).
- **Integration dependency:** an ephemeral real MySQL (throwaway), NOT a mocked store — a mocked datastore cannot verify the `version` CAS, the `active_run_phase IS NULL` claim, or the reaper age scan that the single-active-run and stuck-release guarantees depend on.
- **PII guard:** any user fixture uses a `*@example.test` address.
- **Cleanup boundary:** per-test — every test inserts under its own suite-unique id prefix and deletes its rows (or truncates the pipeline + coordinated tables) on teardown so concurrent / idempotency tests (AC-14) stay independent and the suite does not go flaky.

## NFR validation (load)

<!-- N/A: no dedicated load tool — owner decision (2026-06-13). The numeric §6 NFRs are validated
     by time-controlled integration tests instead of a separate load harness. Recorded here so the
     coverage is explicit, not silently dropped: -->

The numeric §6 NFRs are **covered by integration-level timing assertions**, not a dedicated load run:

- p95 pipeline-state read ≤ 300 ms → integration: resume-read on a seeded pipeline row asserts a single-PK-lookup latency budget; availability 99.9% is an SLO, not a test.
- Resume freshness ≤ 2 s → integration: a second observer reads the state after a transition and asserts convergence within the bound.
- Stuck-phase release ≤ 10 min → integration: `insertStuckPhase` with heartbeat aged past the bound; the reaper / lazy-on-read marks it failed and releases the loader.
- Cancel takes effect ≤ 5 s (0 jobs enqueued after) → integration: cancel then assert no new work enqueued (AC-06).
- Cost-estimate accuracy ±10% for ≥95% of runs → integration: assert the server-recomputed actual stays within the tolerance of the shown estimate on a run; ratio is a telemetry KPI, not a unit assertion.
- Reference-image concurrency ≤ 4 (rolling window) → integration: drive >4 references and assert no more than 4 generate in parallel.
- Idempotency — 0 duplicate reference-block sets → integration: concurrent double-confirm asserts a single block set (AC-14).

## CI placement

- **On every PR (fast):** unit, contract, component.
- **On schedule / pre-release (heavier):** integration (throwaway MySQL), e2e (API-driven), e2e-through-UI, visual-regression.
