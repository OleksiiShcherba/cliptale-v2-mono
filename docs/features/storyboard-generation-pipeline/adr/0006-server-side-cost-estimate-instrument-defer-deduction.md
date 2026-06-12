---
status: Accepted
owner: "Tech Lead"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-06-12"
feature_size: "L"
ticket: "storyboard-generation-pipeline"
---

# 0006 — Compute and re-validate the cost estimate server-side, instrument the actual cost, and defer credit deduction

- **Status:** Accepted
- **Date:** 2026-06-12
- **Deciders:** Tech Lead, Security Lead, Architect (Socratic walk)

## Context

Two expensive phases (reference-image, scene-image) are committed via confirm modals that must show a cost estimate up front (AC-03, AC-04), and the actual charge must stay within ±10% of it (§6 NFR). But the repo has **no credits substrate** — no `users.credits`, no ledger, no deduction; the existing `aggregate_estimate_credits` column is audit-only and the worker's "charge per run" (inherited ADR-0004) is unimplemented. This resolves OQ-1.

## Decision drivers

- §6 NFR: actual charge within ±10% of the shown estimate for ≥ 95% of runs.
- §6.1 abuse case: cost-estimate manipulation — the estimate must be **computed and re-validated server-side**, never trusted from the client.
- KPI: instrument estimate **and** actual on the same run from day 1.
- Building a billing subsystem from zero is out of the orchestration rework's core scope (spec §3 non-goal: do not re-tune generators / cost).

## Considered options

1. **Instrument-only** — compute the estimate server-side, re-validate it server-side at confirm/charge time, persist both estimate and actual cost per run (delta recorded from day 1); defer real credit *deduction* to a follow-up.
2. **Full charge-per-run now** — build the credit ledger + deduction + pre-flight balance gate inside this pipeline.
3. **Defer entirely** — no estimate plumbing in this feature.

## Decision outcome

**Chosen:** Option 1. It satisfies the AC-03/AC-04 modal requirement (a real server-computed price), the §6.1 server-side re-validation abuse-control, and the day-1 estimate-vs-actual KPI, while keeping a from-scratch billing build-out out of scope. Option 2 is a large new billing subsystem beyond the orchestration rework. Option 3 contradicts AC-03/AC-04 (the modals must show a price). The ±10% NFR becomes measurable now; the deduction step is thin once a credits substrate exists. Ownership of the deduction implementation is carried as a §11 open question.

## Consequences

**Positive**
- Modals show a trustworthy server-side price; estimate-vs-actual delta is measurable from launch.
- No premature billing subsystem; deduction lands cleanly later on real data.

**Negative**
- Until deduction ships, the ±10% NFR is *observed* (delta logged) but not *enforced* by a charge — the KPI baseline is "instrument first."
- A `cost_estimate` / `actual_cost` persistence shape must be designed now so the later deduction reads it.

**Neutral**
- The estimate computation reuses the per-capability cost data already used for the cast-extraction `aggregate_estimate_credits`.

## Links

- Spec: [[../spec.md]] §8 OQ-1
- SAD: [[../sad.md]] §4, §8, §11
- Related ADR: [[0001-own-orchestration-in-backend-pipeline-state-machine]]
