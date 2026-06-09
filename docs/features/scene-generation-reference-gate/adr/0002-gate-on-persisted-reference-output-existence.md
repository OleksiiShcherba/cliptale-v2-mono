---
status: Accepted
owner: "Oleksii (Storyboard squad)"
reviewers: ["Tech Lead"]
updated_at: "2026-06-09"
feature_size: "M"
ticket: "scene-generation-reference-gate"
---

# 0002 — Gate scene generation on persisted reference-output existence

<!-- Supersedes storyboard-reference-flows ADR-0011 (star gate in the API service): keeps the
     "gate lives in the API service at generation start" placement, replaces the readiness *condition*
     from "every block has ≥1 starred result" to "every block has ≥1 persisted completed output". -->

- **Status:** Accepted
- **Date:** 2026-06-09
- **Deciders:** Oleksii (Storyboard squad), Tech Lead

## Context

Starting full-draft scene generation today is gated on starring (every reference block needs ≥1
starred result). Starring is a curation chore that does not prove a reference *exists yet*, and a
manually-added block (no rolling-window state) or a finished-but-unstarred block can wedge the
gate or feed an empty reference. The genuine readiness condition is "every cast reference has
finished generating." This ADR fixes *how* the gate reads that condition.

## Decision drivers

- spec §1 ¶4: manual blocks (no `window_status`) and finished-but-unstarred blocks must not deadlock the gate or feed an empty reference.
- AC-07: a block still generating in the media-worker rolling-window has no persisted output yet and must read as not-ready — scene generation must not outrun reference generation.
- NFR §6: gate evaluation must add no paid generation and keep start p95 ≤ 500 ms / status read p95 ≤ 300 ms — a cheap persisted read, not a live subscription.
- Constraint §2: zero new infrastructure — no new event channel.

## Considered options

1. **Persisted output-existence read** — ready = the block has ≥1 completed result persisted; evaluated server-side in the API service at start. Dual scope: full-set for full-draft, scene-linked for per-scene.
2. **Read the raw `window_status == done`** — gate on the rolling-window status column.
3. **Live completion-event subscription** — subscribe to / await a generation-completion event before allowing the start.

## Decision outcome

**Chosen:** Option 1. Output-existence is the only reading that treats a rolling-window block, a
manually-added block, and a finished-but-unstarred block uniformly — closing the deadlock failure
mode (spec §1 ¶4). Option 2 fails manual blocks (`window_status = NULL`) and finished blocks that
produced no usable output. Option 3 is stateful, adds infrastructure, and contradicts the spec's
"readiness is always the persisted-state read, never a completion-event subscription" (AC-07).
The "every scene must be linked once the draft holds ≥1 reference block" rule (AC-04b) and the
zero-reference pass-through (AC-04) are part of this same gate.

## Consequences

**Positive**
- Manual + unstarred + still-generating blocks all read correctly; no deadlock, never an empty reference (QG-1).
- Pure persisted read → cheap, no provider call on the gate path (NFR §6).
- Per-scene regeneration scopes to scene-linked blocks only (AC-03 / AC-03b).

**Negative**
- Readiness is a snapshot at start — a reference regenerated mid-run is not re-validated (accepted as §11 OQ).

**Neutral**
- TOCTOU window between the API gate and worker execution is inherited from the predecessor and accepted.

## Links

- Spec: [[../spec.md]] §4 US-01/US-02/US-03/US-04, §5 AC-01/AC-02/AC-03/AC-04/AC-04b/AC-07
- SAD: [[../sad.md]] §4
- Related ADR: [[0003-feed-each-linked-block-a-single-selected-reference-output]]; supersedes storyboard-reference-flows ADR-0011
