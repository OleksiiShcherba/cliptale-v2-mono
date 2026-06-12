---
status: Accepted
owner: "Tech Lead"
reviewers: ["Tech Lead"]
updated_at: "2026-06-12"
feature_size: "L"
ticket: "storyboard-generation-pipeline"
---

# 0004 — Resume by a single-state read with observer tabs and no hard draft lock

- **Status:** Accepted
- **Date:** 2026-06-12
- **Deciders:** Tech Lead, Architect (Socratic walk)

## Context

A Creator may close/reload the page mid-generation or open the same draft in a second tab (spec §8 OQ-4). On reopen the screen must show the exact current state — the running loader or the pending modal — and a second tab must not corrupt the run.

## Decision drivers

- §6 NFR: resume freshness ≤ 2 s after open; pipeline-state read p95 ≤ 300 ms.
- AC-05: reopened client reflects true backend state; other tabs converge (including a modal opening/closing driven elsewhere).
- AC-14: a second tab triggering the same step must not start a duplicate run.
- Reuse the existing Redis-pub/sub + ws realtime (`publishStoryboardStatusUpdated`).

## Considered options

1. **Single backend-authoritative pipeline + observer tabs** — every open reads the one state row; realtime pushes convergence to all tabs; no lock. Idempotency (ADR-0007) makes concurrent triggers harmless.
2. **Hard draft-level lock** — only one tab may drive the pipeline; other tabs are read-only-locked.

## Decision outcome

**Chosen:** Option 1. The backend is the single authority; tabs are interchangeable observers that read-on-open and converge via realtime, with idempotency (ADR-0007) collapsing concurrent triggers to the existing run. A hard lock introduces a lock lifecycle problem (a closed tab that holds the lock traps the Creator — the very failure mode this feature exists to remove) and degrades the multi-tab UX for no invariant that idempotency does not already protect.

## Consequences

**Positive**
- No lock lifecycle to manage; a crashed/closed tab leaves no stuck lock.
- Multi-tab "just works": all tabs reflect the same state.

**Negative**
- Convergence depends on realtime delivery; a missed event must be healed by the read-on-open and a poll fallback (→ §11 risk: convergence lag).

**Neutral**
- Two tabs may both render the same modal; confirming on either is idempotent (ADR-0007).

## Links

- Spec: [[../spec.md]]
- SAD: [[../sad.md]] §4, §6
- Related ADR: [[0007-single-active-run-via-active-run-marker-and-cas]]
