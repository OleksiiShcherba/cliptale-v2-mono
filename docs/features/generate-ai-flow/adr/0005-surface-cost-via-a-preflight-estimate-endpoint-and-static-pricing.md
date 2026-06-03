---
status: Accepted
owner: "Tech Lead"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-06-03"
feature_size: "L"
ticket: "generate-ai-flow"
---

# 0005 — Surface cost via a pre-flight estimate endpoint and a static pricing table

- **Status:** Accepted
- **Date:** 2026-06-03
- **Deciders:** Architect + Tech Lead (Socratic walk)

## Context

Before any paid provider call the Creator must confirm an estimated cost (spec AC-11). The model catalog carries **no pricing metadata**, and providers bill on actual output (duration/resolution/retries) not known until completion (spec §8 OQ). We must choose how the estimate is produced and surfaced (sad §4 pillar 3).

## Decision drivers

- Cost-safety (spec §1 QG-1, AC-11): the confirmation gate must exist before the provider call.
- Server authority (spec §6.1): the figure the gate uses must come from the server, not a client guess.
- The estimate is best-effort by nature (actuals reconcile out of band — spec §8).

## Considered options

1. **Pre-flight estimate endpoint** (`POST …/estimate`) returning a best-effort figure from a static per-model pricing table; the UI shows it, then a separate confirmed Generate proceeds.
2. **Estimate in the submit response** — Generate returns an estimate and waits for a second confirm call (estimate + execute on one endpoint).

## Decision outcome

**Chosen:** Option 1. Separating estimate from execution keeps the spend action a single confirmed step (no half-submitted job holding resources) and lets the canvas refresh an estimate as inputs change without risking a provider call. The pricing source is a static per-model table in `api`/`api-contracts`; its actual values are an open question (spec §8) tracked in §11. The estimate is explicitly labelled best-effort in the UI.

## Consequences

**Positive**
- The cost gate is server-sourced and decoupled from execution; cancel (AC-11) is trivially side-effect-free.
- The estimate can be shown live as the Creator edits, before committing.

**Negative**
- A static table drifts from real provider pricing; it needs periodic manual updating (accepted debt, §11).
- One extra round-trip before Generate.

**Neutral**
- Reconciliation of estimate vs actual charge is out of band (spec §8) and not built here.

## Links

- Spec: [[../spec.md]]
- SAD: [[../sad.md]] §4
- Related ADR: [[0004-rate-limit-generate-with-a-per-creator-redis-sliding-window]]
