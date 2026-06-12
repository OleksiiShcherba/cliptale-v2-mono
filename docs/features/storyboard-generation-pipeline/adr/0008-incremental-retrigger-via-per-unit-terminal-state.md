---
status: Accepted
owner: "Tech Lead"
reviewers: ["Tech Lead"]
updated_at: "2026-06-12"
feature_size: "L"
ticket: "storyboard-generation-pipeline"
---

# 0008 — Make cancel and re-trigger incremental via per-unit terminal-state

- **Status:** Accepted
- **Date:** 2026-06-12
- **Deciders:** Tech Lead, Architect (Socratic walk)

## Context

Cancelling a running phase must keep every already-produced result, and re-triggering after a cancel (or a partial failure) must regenerate **only** the units that did not finish, never re-spending on completed units (AC-06, glossary "Cancel"). This couples QG-2 *Interruption-safety* with QG-3 *Cost-integrity*.

## Decision drivers

- AC-06: re-trigger regenerates only unfinished units; already-produced results untouched; no re-spend.
- QG-3 *Cost-integrity*: re-triggers must not multiply charges.
- Reuse `storyboard_reference_blocks.window_status` (`pending`/`running`/`done`/`failed`) — the rolling window already tracks per-unit terminal state.

## Considered options

1. **Per-unit terminal-state** — each unit (reference block, scene block) carries a terminal status; cancel/re-trigger acts only on non-terminal (`pending`/`running`→requeue) units, skipping `done`. Reuses `window_status`.
2. **Full regenerate** — re-trigger restarts the whole phase from scratch.
3. **Checkpoint snapshots** — snapshot phase progress and resume from the last checkpoint.

## Decision outcome

**Chosen:** Option 1. Per-unit terminal-state is already the rolling-window model for references and extends naturally to scenes; cancel keeps `done` units and re-trigger re-enqueues only the rest. Option 2 re-spends on completed units, violating AC-06 and QG-3. Option 3 adds a checkpoint mechanism the codebase does not have and that per-unit status already subsumes.

## Consequences

**Positive**
- Cancel is cheap and lossless; re-trigger never double-charges.
- Uniform model across reference-image and scene-image phases.

**Negative**
- Scene-image generation must adopt the same per-unit terminal-status discipline the reference rolling-window already uses (a small extension to `storyboard_scene_illustration_jobs`).

**Neutral**
- "Incremental" interacts with the cost estimate (ADR-0006): a re-trigger estimate should price only the not-yet-done units.

## Links

- Spec: [[../spec.md]]
- SAD: [[../sad.md]] §4, §8
- Related ADR: [[0005-release-stuck-phases-via-lazy-read-and-reaper]], [[0006-server-side-cost-estimate-instrument-defer-deduction]]
