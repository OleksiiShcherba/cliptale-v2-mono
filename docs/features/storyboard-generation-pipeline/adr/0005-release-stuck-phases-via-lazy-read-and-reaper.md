---
status: Accepted
owner: "Tech Lead"
reviewers: ["Tech Lead"]
updated_at: "2026-06-12"
feature_size: "L"
ticket: "storyboard-generation-pipeline"
---

# 0005 — Release stuck phases via lazy-on-read plus a reaper sweep at a 10-minute heartbeat bound

- **Status:** Accepted
- **Date:** 2026-06-12
- **Deciders:** Tech Lead, PM, Architect (Socratic walk)

## Context

A running phase whose underlying work fails or makes no progress must never leave the Creator permanently behind the blocking loader (spec §2, AC-12, glossary "Stuck phase"). This resolves OQ-3 (the exact timeout and how "no progress" is measured).

## Decision drivers

- §6 NFR: a `running` phase with no progress for ≤ 10 min is marked failed and the loader released; measured by worker heartbeat / phase-age.
- QG-2 *Interruption-safety* — the Creator is never permanently blocked.
- Resume-by-read (ADR-0004) means a **closed** tab produces no read to trigger lazy detection — a backstop is required.

## Considered options

1. **Hybrid: lazy-on-read + reaper sweep** — the pipeline-state read flips an over-bound `running` phase to `failed` immediately (instant release when a client is watching); a BullMQ repeatable reaper job sweeps for over-bound phases as a backstop for closed tabs. "No progress" = `phase_started_at`/last-heartbeat age > 10 min.
2. **Reaper only** — a periodic sweep; release latency bounded by the sweep interval even when a client is watching.
3. **Lazy-on-read only** — staleness computed on read; a closed tab never releases.
4. **BullMQ job-timeout only** — rely on queue attempts/timeout; cannot detect "no progress" within one long-running job and is blind to the phase as a whole.

## Decision outcome

**Chosen:** Option 1. Lazy-on-read gives instant release in the common case (the Creator is watching the loader); the reaper guarantees release for the closed-tab case that resume-by-read otherwise leaves uncovered. Option 2 adds sweep-interval latency to the common case. Option 3 violates the closed-tab guarantee. Option 4 cannot measure phase-level no-progress.

## Consequences

**Positive**
- Instant release when watched; guaranteed release when not.
- Heartbeat/phase-age is a cheap column on the state row (ADR-0002).

**Negative**
- A healthy but slow phase past 10 min would be false-released → must size the bound and heartbeat carefully (→ §11 risk).
- Adds one repeatable worker job (the reaper) to operate and monitor.

**Neutral**
- The 10-min bound is configurable via `APP_*` (per the config convention).

## Links

- Spec: [[../spec.md]]
- SAD: [[../sad.md]] §4, §8
- Related ADR: [[0003-advance-phases-via-worker-completion-hooks]]
