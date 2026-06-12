---
status: Accepted
owner: "Tech Lead"
reviewers: ["Tech Lead"]
updated_at: "2026-06-12"
feature_size: "L"
ticket: "storyboard-generation-pipeline"
---

# 0003 — Advance phases via worker completion-hooks into a backend transition service

- **Status:** Accepted
- **Date:** 2026-06-12
- **Deciders:** Tech Lead, Architect (Socratic walk)

## Context

Phases run as async BullMQ jobs in the media-worker (`storyboard-plan`, `ai-generate`, `storyboard-openai-image`). With backend-owned state (ADR-0001) in a single row (ADR-0002), something must move the pipeline from one phase/sub-state to the next when work completes. The worker already has a completion-hook pattern: `onReferenceBlockJobComplete` claims and enqueues the next pending reference in the rolling window.

## Decision drivers

- QG-2 *Interruption-safety* — transitions (including stuck-release and cancel) must be decided in one authoritative place.
- AC phase-order invariants (AC-08, AC-15) and single-active-run (AC-14) must hold regardless of which surface triggered the work.
- Reuse the existing `onReferenceBlockJobComplete` completion-hook pattern rather than inventing a new mechanism.

## Considered options

1. **Worker completion-hook → backend transition service** — on unit completion the worker calls a transition service (in-process call within the worker, or an internal api call) that owns all phase transitions and guards; the worker only reports unit results.
2. **Worker writes pipeline state directly** — each job updates the `storyboard_pipeline` row itself.
3. **Api polls job/queue status on a timer** and advances phases.

## Decision outcome

**Chosen:** Option 1. Transition logic and guards live in one transition service, invoked both by Creator actions (api: start/cancel/skip/trigger/confirm) and by worker unit-completion hooks — the state machine has a single owner. Option 2 scatters transition/guard logic across api and worker, making invariants impossible to hold in one place. Option 3 adds transition latency and polling load and ignores the completion-hook pattern already in the codebase.

## Consequences

**Positive**
- One transition table / guard set; invariants enforced uniformly.
- Reuses the proven rolling-window completion-hook pattern.

**Negative**
- The transition service must be callable from both the api process and the worker process. **Resolved (§5):** a **shared transition module** imported by both (not an internal HTTP endpoint) — no network hop, but both processes write the state row directly, so the module is the single home for transition/guard/CAS logic.

**Neutral**
- Per-unit progress still lives in the job tables; the hook bridges unit-completion → phase-transition.

## Links

- Spec: [[../spec.md]]
- SAD: [[../sad.md]] §6, §8
- Related ADR: [[0002-single-pipeline-state-row-per-draft]], [[0005-release-stuck-phases-via-lazy-read-and-reaper]]
