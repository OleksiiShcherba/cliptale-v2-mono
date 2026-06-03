---
status: Accepted
owner: "Tech Lead"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-06-03"
feature_size: "L"
ticket: "generate-ai-flow"
---

# 0004 — Rate-limit Generate with a per-Creator Redis sliding-window counter

- **Status:** Accepted
- **Date:** 2026-06-03
- **Deciders:** Architect + Tech Lead + Security Lead (Socratic walk)

## Context

Generate is a spend-bearing action. The UI cost confirmation can be bypassed by scripting the API directly, so spend must be capped server-side, per Creator, independent of the UI (spec §6.1 abuse case; §6 NFR ≤ 30 Generate runs/min/Creator). The existing `express-rate-limit` middleware is IP-scoped and therefore insufficient (sad §4 pillar 3).

## Decision drivers

- Financial-abuse guard (spec §6.1): must key on Creator identity, not IP (shared NAT / multiple tabs).
- ≤ 30 Generate/min/Creator (spec §6), enforced regardless of UI.
- Multi-instance API: the counter must be shared across replicas; Redis already exists.

## Considered options

1. **Redis sliding-window counter** keyed by `userId`.
2. **Redis fixed-window counter** (`INCR` + `EXPIRE` per minute) keyed by `userId`.
3. **DB query** counting `ai_generation_jobs` in the last minute on each Generate.

## Decision outcome

**Chosen:** Option 1. A sliding window avoids the 2×-burst edge of a fixed window at the minute boundary — material when the cap exists to bound spend. Redis is already a singleton; the counter survives multi-instance API and can't be reset by the client. A DB count adds a hot query to every spend action and scales worst.

## Consequences

**Positive**
- Scripting cannot exceed the cap; the guard is independent of the UI confirmation.
- Accurate near the window boundary; no new infrastructure.

**Negative**
- Sliding-window bookkeeping is slightly more code than `INCR`/`EXPIRE`.

**Neutral**
- The exact threshold + any per-plan quota is an open question (spec §8) tracked in §11; the default ≤ 30/min is implemented now.

## Links

- Spec: [[../spec.md]]
- SAD: [[../sad.md]] §4
- Related ADR: [[0005-surface-cost-via-a-preflight-estimate-endpoint-and-static-pricing]]
