---
status: Draft
owner: "QA + Backend Lead"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-06-19"
feature_size: "L"
---

# Test plan — ai-motion-graphic

A Creator describes a graphic in natural language; an AI authors a reusable **code-backed Motion Graphic**, previews it live in the browser, and refines it through a persistent chat. The graphic attaches to storyboard blocks as a **frozen snapshot** of code + duration. Every read/write is filtered by the owning Creator (no cross-account path); a ready graphic must obey the **deterministic-render rule** (AC-09). This plan maps every `spec.md §5` acceptance criterion to ≥1 named test before any test is written; `implement` reads the AC→test map and writes the red tests against it.

Surfaces (`sad.md` `target_surfaces`): **backend-service + web-frontend** → the frontend "testing-trophy" tiers (component / e2e-through-UI) apply. Visual-regression is intentionally dropped (see Levels).

## Levels

| Level | Scope | Strategy (generic — no tool names) |
|---|---|---|
| Unit | Pure logic: prompt min-length validator, cost-match rule, deterministic-render AST-scan rule, guardrail intent classifier — no I/O. | In-memory, no external dependency. |
| Integration | The api module against the real datastore it owns + the guardrail against the real guard. | Real MySQL (repo convention — never mocked; `singleFork: true`), spun up for the suite. |
| Contract | The web-editor ↔ api boundary: REST request/response shapes + the SSE token-stream event schema, both agreed in `contracts/openapi.yaml`. | Validate the real api shape against the committed contract; no hand-rolled stubs. |
| E2E-through-UI | One full user-story flow driven through the real web-editor UI, not just the api. | The flow exercised through the rendered UI against ephemeral dependencies (real MySQL, stubbed LLM boundary). |
| Component | A web-editor UI piece in isolation: the preview region/layout (canvas-fill, chat alongside, duration input above chat) and the browser transpile+mount path that enforces AC-09. | Render in a component harness; assert layout + behaviour, no full app boot. |
| Load | Numeric server NFR validation only. | The load tool already in the repo, or e.g. k6 / Locust. |
| Visual-regression | <!-- N/A: per decision 2026-06-19 — preview layout is covered by component-level assertions; pixel-snapshot baselines are too brittle/costly for an animated <Player>. Render parity is enforced by AC-09 + the CI frame-diff fixture set, not per-render UI snapshots. --> |

## AC coverage

Every acceptance criterion in `spec.md §5` maps to ≥1 test. Levels recorded here are the user's authoritative choices (walk 2026-06-19); `implement` writes the test at the named level, it does not re-decide.

| AC (spec.md §5) | Test name (intent-based) | Level | Expected outcome |
|---|---|---|---|
| **AC-01** (US-02) happy — generate | confirmed generation records a ready graphic sized to the chosen duration | integration + contract + e2e-through-UI | graphic stored under the Creator with an auto-title, the chosen fixed duration, status ready; shown ready to preview |
| **AC-02** (US-03) happy — live preview | opening a ready graphic plays it back in a canvas-filling preview with chat alongside | component + integration + e2e-through-UI | preview region fills the canvas area, authoring chat shown alongside, duration input above the chat; graphic plays in real time |
| **AC-03** (US-04) happy — refine | a confirmed refinement updates the graphic and appends to chat history | integration + e2e-through-UI | graphic's current code updated, the exchange appended to persistent chat, refreshed graphic shown in live preview |
| **AC-04** (US-07) happy — attach snapshot | attaching a ready graphic freezes its code + duration onto the block | integration + contract + e2e-through-UI | a frozen snapshot of the graphic's current code + duration recorded on the block; graphic shown among the block's media |
| **AC-05** (US-02) error — empty / too-short description | a description below the meaningful-prompt minimum is declined before generation | unit + integration | generation not started; Creator told in plain language a longer, meaningful description is required |
| **AC-06** (US-02) error — generation unusable | a generated graphic that fails to run or fails determinism is marked not usable | unit (AC-09 rule) + integration + e2e-through-UI | graphic marked not usable, failed attempt persisted; Creator told it didn't produce a working graphic and offered retry/refine — no broken preview shown |
| **AC-07** (US-05) authorization — non-owner | a non-owner acting on a graphic through any surface is refused as not-exist | integration | access denied uniformly as though the graphic does not exist; existence/content never revealed (rows per surface below) |
| **AC-08** (US-07) invariant — attach non-ready | attaching a still-generating or not-usable graphic is blocked | integration | attachment blocked; Creator told only a ready, working graphic can be used |
| **AC-09** (US-02) invariant — deterministic render | a graphic animating from wall-clock/randomness is held back from ready | unit + component + e2e-through-UI | graphic treated as not meeting the deterministic-render rule and not presented as ready, so preview ↔ export stay frame-identical |
| **AC-10** (US-07) cross-context — snapshot isolation | refining a source graphic after attach does not alter the placed instance | integration | the already-attached instance is unchanged from its snapshot after a later source refinement |
| **AC-11** (US-06) error — cost-guard | a generation whose cost the server re-computation cannot confirm is refused | unit + integration | generation refused; Creator told the shown estimate could not be confirmed (same match rule as the existing cost-estimate+confirm service) |
| **AC-12** (US-08) happy — duplicate | duplicating a graphic yields an independent copy seeded with live, re-runnable chat | integration + e2e-through-UI | independent copy owned by the same Creator, chat seeded as live re-runnable turns (not a frozen transcript) + current code; refining the copy does not affect the original |
| **AC-13** (US-01) happy — list mine | the page lists only the Creator's graphics, with an empty state when none | integration + contract + e2e-through-UI | only graphics owned by the requester listed, each with title + duration; empty state shown when there are none |
| **AC-14** (US-04) error — broken refinement | a refinement that breaks or is non-deterministic keeps the last working version | integration + e2e-through-UI | last working version stays the current ready state; failed attempt recorded in chat with a plain-language error; previously working graphic not overwritten or broken |

### NFR-derived coverage

| NFR (spec.md §6) | Test name (intent-based) | Level | Expected outcome |
|---|---|---|---|
| Malicious-prompt guardrail ≥95% red-team refusal | red-team prompt set is refused before generation runs | unit + integration | ≥95% of the curated Security-Lead red-team set (exfiltration / system-subversion intent) refused pre-generation; conformance asserted over the whole set against the real guard |
| Render parity (preview vs future server export) | a fixed fixture set renders identically frame-for-frame in CI | integration (CI frame-diff) | every fixture's rendered frames match the approved baseline; combined with AC-09 enforcement guarantees preview ↔ export parity (no per-user-graphic runtime frame-diff) |

## Edge cases / error paths

Each error / authorization criterion gets its own dedicated row — never folded into a happy path.

**Input validation (AC-05)**
- Empty description submitted → expected: generation declined pre-LLM; plain-language "longer, meaningful description required".
- Description shorter than the minimum meaningful length → expected: generation declined pre-LLM, same message.

**Authorization — non-owner, "respond as not-exist" (AC-07), one row per surface action**
- Non-owner opens a graphic → expected: responded to as not found; existence never revealed.
- Non-owner previews a graphic → expected: not found.
- Non-owner continues the chat / refines a graphic → expected: not found.
- Non-owner attaches a graphic to a block → expected: not found.
- Non-owner duplicates a graphic → expected: not found.

**Ready-state invariant (AC-08)**
- Attach a `generating` graphic → expected: blocked, "only a ready, working graphic can be used".
- Attach a `failed` (not-usable) graphic → expected: blocked, same message.

**Deterministic-render rule (AC-09 / AC-06 / AC-14)**
- Generated code reads wall-clock time (`Date.now()` / `new Date()`) → expected: not deterministic, never reaches ready.
- Generated code uses randomness (`Math.random()`) → expected: not deterministic, never reaches ready.
- Generated code that fails to transpile / fails to run in preview → expected: marked not usable (AC-06), or last working kept on refine (AC-14).

**Cost-guard (AC-11)**
- Server re-computation does not confirm the shown estimate under the existing match rule → expected: generation refused, "shown estimate could not be confirmed".
- Tampered client estimate undercutting a costly generation → expected: refused on mismatch (instrument-only, no ledger).

**Cross-context isolation (AC-10)**
- Source graphic refined after a snapshot was attached → expected: the placed instance is byte-for-byte its snapshot, unaffected by the source edit.

**Refinement durability (AC-14)**
- Refinement produces non-running code → expected: current code unchanged, failed turn appended with plain error.
- Refinement produces non-deterministic code → expected: current code unchanged, failed turn appended.

**Guardrail (NFR)**
- Prompt with exfiltration / system-subversion intent → expected: refused before generation runs.

## Test data

- **Seed strategy:** factories matching `data-model.md` entities — `makeMotionGraphic(overrides)` (default `status='ready'`, `code` = a minimal deterministic `useCurrentFrame()` component, owner = a seeded `user-<uuid>@example.test`), `makeChatTurn(graphicId, overrides)` (next `seq`), `makeBlockSnapshot(graphicId, overrides)` (snapshot row + `storyboard_block_media` with `media_type='motion_graphic'`, `file_id=NULL`), plus `status='generating'` / `status='failed'` variants for the AC-06 / AC-08 / AC-14 paths.
- **Integration dependency:** the repo's **real MySQL** (Vitest integration convention — never a mocked store; `singleFork: true`), spun up for the suite. The LLM provider is the one ephemeral *boundary* that is stubbed (deterministic canned token streams — generation success, non-deterministic output, non-running output), because it is a third-party non-owned dependency, not the datastore.
- **Cleanup boundary:** **per-test** reset of the feature-owned rows (`motion_graphics`, `motion_graphic_chat_turns`, `motion_graphic_block_snapshots`, and the `motion_graphic` rows in `storyboard_block_media`) so runs are independent; seeded `@example.test` users cleaned **per-suite**. PII guard: `example.test` addresses only.

## NFR validation (load)

One scenario per **numeric server-side** NFR. Per the 2026-06-19 decision, the two client/stream NFRs are validated by **instrumentation + a CI threshold on the fixed fixture set**, not by a load tool (a browser render does not scale by request rate).

- **Motion Graphics list load ≤ 400 ms p95** (server list-endpoint) → **load scenario:** sustain a representative request rate against the list endpoint (owner with a realistic graphic count) for a fixed duration; assert p95 ≤ 400 ms with no error-rate regression. Tool: the load tool already in the repo, or e.g. k6 / Locust.
- **Live preview ready ≤ 1500 ms p95** (client: code-received → first rendered frame, incl. transpile + runtime init) → **not a load test:** client preview-render timing metric, asserted against the ≤ 1500 ms threshold on the fixed fixture set in CI.
- **Time-to-first-streamed-token ≤ 3 s p95** (generation/refinement) → **not a load test:** chat streaming metric, asserted against the ≤ 3 s threshold via instrumentation on a canned generation in CI.
- **Render parity** → not a load metric — enforced by the AC-09 rule + the CI frame-diff on the fixture set (see NFR-derived coverage).

## CI placement

Advice, not pipeline config — `implement` and the repo's CI own the real wiring. (Repo note: run Vitest from `apps/web-editor`; integration suites hit real MySQL with `singleFork: true`.)

- **On every PR (fast):** unit, component, contract; integration (real MySQL); the guardrail conformance suite; the CI frame-diff parity check + the client/stream instrumentation thresholds on the fixed fixture set.
- **On schedule / pre-release (heavier):** e2e-through-UI; the list-endpoint load scenario.
