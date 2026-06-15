---
status: Draft
owner: "PM + Tech Lead"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-06-12"
feature_size: "L"
---

# Spec — storyboard-generation-pipeline

> **Glossary:** [CONTEXT](./CONTEXT.md)
> **Reference modules / docs / channels used:** the existing Step-2 orchestration it unifies and replaces —
> [generate-ai-flow](../generate-ai-flow/spec.md), [storyboard-reference-flows](../storyboard-reference-flows/spec.md),
> [scene-generation-reference-gate](../scene-generation-reference-gate/spec.md),
> [reference-generation-autostart](../reference-generation-autostart/spec.md); plus `docs/architecture-map.md`
> (Step-2 storyboard subsystem, BullMQ worker orchestration, realtime). No other channels read.

## 1. Context

The Step-2 (Video Road Map) automatic-generation flow is **broken**: its orchestration lives in the frontend, so it loses all progress when the Creator closes or reloads the page, traps the user behind ad-hoc status blocks (*Scene planning*, *Illustration status*) that carry no real meaning, and stitches scene planning, cast extraction, reference generation and scene illustration together inconsistently. Creators — the signed-in owners of a storyboard draft — cannot reliably get from an empty draft to a fully illustrated set of scenes, and a closed tab means starting over. This is the core "open Step 2 and it just doesn't work" failure.

Why now: the four features that today own pieces of this flow (scene planning, cast extraction, reference flows, the reference gate, reference autostart) were shipped independently and their **orchestration seam is the thing that's failing in production** — frontend-owned state, no resume, dead-end gates. Each shipped feature works in isolation; the glue does not. Continuing to patch the glue per-feature (13 post-ship bug fixes in one day on the cast/reference pipeline alone) is more expensive than re-owning the orchestration once.

The committed approach: replace the frontend-driven glue with a **single backend-owned, resumable, sequential pipeline state machine** that walks four ordered phases — scene generation → reference-data (cast proposal) generation → reference-image generation → scene-image generation — each behind a full-screen blocking loader or a review modal, with every transition, cancel, skip and re-trigger decided and persisted server-side. Competitive scan confirms this combination (ordered stages + human review gates + up-front cost transparency + interruption-safe resume) is unoccupied by comparable AI generation tools, which all treat generation as flat independent jobs.

Traceability context: this rework **retires** the *Scene planning* and *Illustration status* statuses and their logic entirely, and **relaxes** the inherited Reference-done gate (a scene with no linked reference now generates text-only instead of dead-ending the batch). The pipeline subsumes the autostart and gate behaviours of the inherited features.
<!-- Decision override slot: critic Override resolutions emit «Decision override: …» bullets here. -->

## 2. Goals

- A Creator can take any draft from empty to fully illustrated scenes through a guided, ordered pipeline whose progress survives page close, reload, and browser switch.
- Every long-running phase is interruption-safe: the Creator is never permanently blocked by a wedged job and never loses already-produced results to a cancel or a reload.
- Every expensive phase is committed with its cost shown up front, and the amount actually charged stays within a bounded tolerance of what was shown.

## 3. Non-goals

- Redesigning the music-generation flow or the music blocks themselves — the pipeline only orders reference blocks **relative to** existing music blocks, it does not change music. (Out of scope; separate feature.)
- Changing the AI models, prompt-construction internals, or per-image quality settings of scene/reference generation — the pipeline orchestrates the existing generators, it does not re-tune them. (Cost/quality tuning is a separate track.)
- Building a general multi-draft job dashboard or cross-draft queue view — resume is per-draft, surfaced inside Step 2 only. (Avoids scope creep into a jobs console.)
- Editing-while-generating — the blocking loader deliberately freezes canvas activity during a running phase; concurrent live editing under a running phase is explicitly not supported. (Keeps the state machine tractable.)

## 4. User stories

### US-01: Auto-generate scenes on entering Step 2

**As a** Creator
**I want** scene generation to start automatically the moment I open Step 2 on an unplanned draft
**So that** I get a scene skeleton without hunting for a button

### US-02: Review the cast proposal before committing

**As a** Creator
**I want** the system to prepare reference data and then show me a cast proposal with scenes already AI-selected per reference
**So that** I can confirm or adjust the cast before any images are generated

### US-03: Create references and their images in one confirmed step

**As a** Creator
**I want** confirming the cast — with the reference-image cost shown on the proposal — to create all reference blocks below my music blocks and generate one image per reference
**So that** my characters and environments are ready to feed scene illustration and I commit to the reference spend knowing its price

### US-04: Generate scene images with the price shown first

**As a** Creator
**I want** to be offered scene-image generation with a precomputed cost estimate
**So that** I decide to spend knowing the price up front

### US-05: Resume exactly where I left off

**As a** Creator
**I want** to close or reload the page mid-generation and, on reopening, see the exact current state — the running loader or the pending modal
**So that** long generations are not tied to my keeping a tab open

### US-06: Never be trapped by a running phase

**As a** Creator
**I want** to cancel any running phase from under the loader and keep whatever already finished, and to have the system itself release me if a phase wedges
**So that** a slow, stuck, or failed job never holds me hostage behind the loader

### US-07: Skip and manually re-trigger any step

**As a** Creator
**I want** to skip a step by dismissing its modal and later trigger any step from controls in the corner
**So that** I control which parts of the pipeline run and when

### US-08: Illustrate every scene, with or without a reference

**As a** Creator
**I want** each scene generated from its text prompt fed with its linked references when it has them, and from text alone when it has none
**So that** linked scenes stay on-model and skipping references never leaves any scene un-illustratable

## 5. Acceptance criteria

### AC-01 (US-01) — happy path

**Given** an authorized Creator opens Step 2 on a draft that has not yet been planned
**When** the pipeline starts
**Then** the system begins scene generation, shows a full-screen blocking loader labelled for scene generation, and on completion records the generated scene blocks and advances the pipeline to the next phase

### AC-02 (US-02) — happy path

**Given** an authorized Creator's draft has just finished scene generation
**When** the pipeline advances
**Then** the system runs reference-data generation behind the same full-screen loader (labelled for reference data), and on completion presents the Review cast proposal modal with each proposed reference showing its AI-selected scenes

### AC-03 (US-03) — happy path

**Given** an authorized Creator is viewing the Review cast proposal modal, which carries a precomputed reference-image cost estimate
**When** the Creator confirms the cast
**Then** the system creates every reference block in order **below all music blocks**, runs reference-image generation behind the loader, and once **every** reference has reached a terminal result presents the scene-image offer modal carrying a precomputed scene-image cost estimate — a reference that ended in failure is tolerated (it does not fail the phase): the phase still advances and that reference's linked scenes fall back to text-only at scene-image time (see AC-11)

### AC-04 (US-04) — happy path

**Given** an authorized Creator is viewing the scene-image offer modal with its cost estimate
**When** the Creator accepts scene-image generation
**Then** the system generates each scene's image behind the loader (labelled for scene image generation) and, once every scene has reached a terminal result, records each successfully generated scene block's image and reports the phase **completed even if some scenes failed** — failed scenes are left without an image and stay individually re-triggerable; a per-scene failure does not fail the whole phase (whole-phase stall/failure is AC-12)

### AC-05 (US-05) — happy path (resume)

**Given** an authorized Creator's draft has a phase running or a review modal pending, and the Creator closed or reloaded the page
**When** the Creator reopens Step 2 for that draft
**Then** the system reconstructs the screen from the backend pipeline state — showing the same running loader or the same pending modal — and the underlying work is found to have continued uninterrupted while the page was closed; any other tab open on the same draft is an observer of the same backend state and converges to that state (including a modal opening or closing in response to a transition driven elsewhere) within the resume-freshness bound (§6)

### AC-06 (US-06) — happy path (cancel)

**Given** an authorized Creator is watching a running phase behind the blocking loader
**When** the Creator cancels from under the loader
**Then** the system stops the phase, enqueues no further work for it, **keeps** every result already produced, and returns the phase to an idle state from which it can be re-triggered; on re-trigger the phase regenerates **only the units that did not finish** (incremental) and leaves already-produced results untouched — re-triggering does not re-spend on completed units

### AC-07 (US-07) — happy path (skip)

**Given** an authorized Creator is viewing a pending review modal (cast proposal or scene-image offer)
**When** the Creator dismisses the modal
**Then** the system records the step's phase in a `skipped` state — distinct from `idle` so a prerequisite check can tell an intentional skip from a never-run phase — and keeps that step available to trigger later from the corner controls

### AC-08 (US-07) — domain invariant violation (phase order)

**Given** an authorized Creator whose draft has not yet completed scene generation
**When** the Creator triggers a later phase (such as scene-image generation) from the corner controls
**Then** the system blocks the trigger and tells the Creator in plain language that the earlier phase must complete first, because phases run in strict order

### AC-09 (US-03) — domain invariant (reference-below-music ordering)

**Given** an authorized Creator confirms a cast on a draft that contains music blocks
**When** the system creates the reference blocks
**Then** every created reference block is ordered **below every music block**, and this ordering holds as the canonical recorded order. This is a placement established **at reference-creation time** (a snapshot): the pipeline does not reactively re-order existing references if a music block is added later (consistent with non-goal §3 — the pipeline does not own music)

### AC-10 (US-08) — cross-context (references feed scene images)

**Given** an authorized Creator accepts scene-image generation and some scenes are linked to Ready reference blocks
**When** the system generates each such scene's image
**Then** it feeds that scene's text prompt together with the **selected reference outputs** of its linked Ready reference blocks and any image directly attached to the scene

### AC-11 (US-08) — cross-context (text-only fallback)

**Given** an authorized Creator accepts scene-image generation and a scene has **no Ready linked reference** — either no linked reference block at all, or links only to non-Ready (failed / cancelled / skipped) reference blocks
**When** the system generates that scene's image
**Then** it generates from the scene's text prompt alone (plus any directly-attached image) and does **not** block the batch on the missing reference — a link without a Ready output is treated as no reference for illustration

### AC-12 (US-06) — error (stuck or failed phase never traps the Creator)

**Given** an authorized Creator is behind the blocking loader and the phase's underlying work fails or makes no progress past its allowed time bound
**When** the bound is exceeded or a terminal failure is detected
**Then** the system marks the phase failed, releases the blocking loader, and tells the Creator what failed with the option to retry — the Creator is never left permanently blocked. This covers a **whole-phase** stall or terminal failure; an individual failed unit inside an otherwise-progressing batch does **not** trigger this path (the phase completes with that unit recorded as failed — see AC-03, AC-04)

### AC-13 (US-05) — authorization

**Given** a signed-in user who is **not** the owner of a draft
**When** that user attempts to read the pipeline state of, or start / cancel / skip / trigger any phase on, that draft
**Then** the system denies the action and does not reveal the draft's existence or pipeline state

### AC-14 (US-07) — domain invariant (single active run / idempotent re-trigger)

**Given** an authorized Creator whose draft already has a phase running or has just confirmed a cast
**When** the same step is triggered again (a repeated confirm, a double trigger, or a second open tab)
**Then** the system does **not** start a duplicate run or create a duplicate set of reference blocks; it continues or returns the existing run

### AC-15 (US-04) — error (manual scene-image trigger with prerequisites unmet)

**Given** an authorized Creator whose draft has no generated scenes yet
**When** the Creator uses the corner control to open scene-image generation
**Then** the system blocks it and explains that scenes must be generated first

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| Latency p95 — pipeline-state read (resume) | ≤ 300 ms | API metric on the Step-2 state read |
| Resume freshness — reopened client reflects true backend state | ≤ 2 s after open | realtime/poll convergence metric |
| Stuck-phase release bound | a `running` phase with no progress for ≤ 10 min is marked failed and the loader released | worker heartbeat / phase-age monitor |
| Cancel takes effect (no new work enqueued) | ≤ 5 s | enqueue-after-cancel audit (target 0 jobs) |
| Cost-estimate accuracy (pending §8 OQ-1 charge ownership) | actual charge within **±10%** of the shown estimate for ≥ 95% of runs | billing telemetry: estimate-vs-actual delta |
| Reference-image concurrency | ≤ 4 references generating in parallel (rolling window) | worker concurrency metric |
| Idempotency of re-trigger / double-confirm | 0 duplicate reference-block sets created | drafts-with-duplicate-blocks audit |
| Availability — pipeline-state read | 99.9% | monthly SLO window |

## 6.1 Security / privacy

- **Data classification:** internal — storyboard creative content (scene text, references, generated images) owned by the Creator; no public exposure.
- **Personal data touched:** none new. The pipeline references existing draft/user ownership; it adds no new personal fields.
- **AuthZ/AuthN impact:** every pipeline operation — reading state, starting/cancelling/skipping a phase, confirming a cast, triggering scene images — is gated on the caller **owning the draft**; the state store always filters by the caller's ownership. A new spend path (image generation behind the cost estimate) is exercised, so charging authorization is in scope. **Authorization is evaluated before any prerequisite/ordering check** (AC-08, AC-15): a non-owner triggering a phase on any draft — even one with prerequisites unmet — receives the opaque deny-and-hide of AC-13, never a prerequisite-specific message that would leak the draft's existence or planning state.
- **Abuse cases:**
  - cross-tenant drive (a non-owner starting/cancelling another Creator's pipeline): deny and hide existence.
  - spam re-trigger (rapidly re-confirming or re-triggering to multiply jobs/charges): idempotency + a per-Creator rate limit; duplicate runs collapse to the existing run.
  - cost-estimate manipulation (tampering with the shown estimate to under-charge): the estimate is computed and re-validated server-side at charge time, never trusted from the client.
  - cancel-spam / cancel races (cancel interleaved with an in-flight job to double-spend): cancel is authoritative; no work is enqueued after it takes effect.
  - resume probing on a non-owned draft: state read denied as cross-tenant.
- **Security review:** Required — new authz surface across pipeline operations + a spend/charge path.

## 7. Metrics / KPIs

- **Step-2 pipeline completion rate** (drafts that reach recorded scene images via the pipeline) — baseline: 0 (new pipeline), target: ≥ 80% of started drafts within 30 days of launch.
- **Stuck-loader support incidents** ("stuck on loading forever" / "generation vanished") — baseline: > 0 today (current frontend-driven flow), target: 0 within 30 days.
- **Resume correctness** (reopen shows the correct phase/modal) — baseline: ~0% (state lost on close today), target: ≥ 99% of reopens within 14 days.
- **Estimate-vs-actual charge delta** (runs within ±10%, pending §8 OQ-1 charge ownership) — baseline: TBD — instrument estimate and actual charge on the same run from day 1; target: ≥ 95% within 30 days.
- **Duplicate reference-block incidents** (drafts with a duplicated cast set) — baseline: > 0 today (no idempotency on confirm), target: 0.

## 8. Open questions

- [ ] Does this rework **own implementing the per-run charge** so the cost estimate has a real counterpart? The reference/scene run path currently bypasses the only charge path (ADR-0004 "charge per run" appears unimplemented in the worker), so the ±10% NFR has nothing to measure against until charging exists. Default now: treat charge alignment as in-scope for this pipeline. — owner: Tech Lead, due: before sdd:design
- [ ] How are **in-flight drafts migrated at deploy** when *Scene planning* / *Illustration status* are deleted (drafts mid-old-flow with queued/running jobs)? Default now: drain or one-time-migrate old jobs into the new pipeline state before cut-over. — owner: Tech Lead, due: before sdd:tasks
- [ ] What is the exact **stuck-phase timeout** value and how is "no progress" measured (worker heartbeat vs. last-status age)? Default now: 10 min with a heartbeat. — owner: PM + Tech Lead, due: before sdd:design
- [ ] **Concurrent-tabs** authority — hard draft-level lock vs. single backend-authoritative pipeline with observer tabs? Default now: one backend-authoritative pipeline; second tab observes the same state. — owner: Tech Lead, due: before sdd:design
- [ ] **Cast-proposal scene display (AC-02 wording)** — should the Review cast proposal modal show each reference's AI-selected scenes *by identity* (resolved scene names/thumbnails) or is the current scene **count** ("3 scenes") sufficient? `scene_ids` are UUIDs, so a raw id list is not user-meaningful; resolving names adds a lookup. Raised by review r3 (F6, minor). Default now: count-only ships; revisit if Creators report they can't tell which scenes a reference covers. — owner: PM, due: post-launch KPI window
</content>
