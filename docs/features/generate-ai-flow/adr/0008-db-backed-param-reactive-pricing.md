---
status: Accepted
owner: "Tech Lead"
reviewers: ["Tech Lead", "Business owner"]
updated_at: "2026-06-04"
feature_size: "L"
ticket: "generate-ai-flow"
---

# 0008 — DB-backed, parameter-reactive pricing for the cost estimate

- **Status:** Accepted — **amends [[0005-surface-cost-via-a-pre-flight-estimate-endpoint-and-a-static-pricing-table]]** (the pricing-source half; the estimate-endpoint half of 0005 stands unchanged)
- **Date:** 2026-06-04
- **Deciders:** Tech Lead + Business owner (review pass 15, client escalation)

## Context

ADR-0005 chose a **static compile-time price table** and recorded its drift as accepted debt, with
the pricing source left as a spec §8 open question. In live use the client rejected that default:
the estimate quotes the same figure for a 5-second 480p run and a 10-second 1080p multi-image run,
and changing any price requires a code edit + redeploy. The price-driving parameters
(`duration`, `resolution`, `num_images`, music length) are already persisted on the canvas and
already forwarded to the provider by the spend path (`buildJobOptions`) — only the estimate ignores
them. The escalation is now committed scope: spec AC-20.

## Decision drivers

- **Adjustability without deploy** — the client must be able to tune prices in the database.
- **Param-reactivity** — the estimate must scale with everything that scales the real provider bill.
- **Day-one safety** — switching the source must not change any current estimate until an operator
  edits a row.
- **Estimate latency** — the canvas re-estimates live (ADR-0005); a DB hit per keystroke is unacceptable.

## Considered options

1. **DB pricing table + formula, static table as seed + fallback** — new `flow_model_pricing`
   (`base_amount` + `per_second` + `per_image` + `resolution_mult` JSON), read through an in-process
   cache; formula scales by the block's effective params (catalog defaults when unset).
2. **Keep prices in code, add param multipliers to the static map** — reactive but still
   deploy-bound; rejected: fails the explicit "adjustable within the database" requirement.
3. **Provider-quoted estimates per request** — most accurate but adds a provider round-trip +
   coupling on the hot estimate path; providers don't uniformly expose quote APIs. Rejected for v1.

## Decision outcome

**Chosen: Option 1.**

- New MySQL table `flow_model_pricing` (one row per catalog model id), seeded **in the migration**
  from `FLOW_PRICE_TABLE` (flat price → `base_amount`, factor columns NULL → behaviour identical
  on day one).
- Formula in `estimateBlockCost`:
  `amount = (base_amount + per_second × duration_s + per_image × num_images) × (resolution_mult[resolution] ?? 1)`,
  rounded to the currency minor unit. Effective param values = block params with catalog-default
  fallback (music: `duration` seconds, legacy `music_length_ms` ÷ 1000).
- Repository with a short-TTL in-process read-through cache (estimate stays fast under live
  re-estimates); the static table remains the fallback when a model has no row — `bestEffort: true`
  stays on every estimate (reconciliation against actuals remains out of band, per 0005).

## Consequences

**Positive**
- Prices and factor curves editable in the DB — no deploy; estimates finally track duration /
  resolution / image count, closing the client-reported gap.
- Zero contract churn: the openapi `CostEstimate`/`Money` shape already carries an arbitrary amount;
  the frontend modal renders whatever the server returns.

**Negative**
- A new operational surface: wrong DB edits produce wrong estimates instantly (mitigated: estimates
  are labelled best-effort and gate-only — they never charge).
- Cache TTL means a price edit takes up to the TTL to propagate (acceptable for pricing).

**Neutral**
- The static map stops being authoritative and becomes seed + fallback; per-model upkeep moves from
  code PRs to DB operations.

## Links

- Spec: [[../spec.md]] — AC-20; §8 pricing OQ resolved 2026-06-04
- Data model: [[../data-model.md]] — `flow_model_pricing`
- Review: `_review/review-2026-06-04.md` — finding U3
- Amends: [[0005-surface-cost-via-a-pre-flight-estimate-endpoint-and-a-static-pricing-table]]
