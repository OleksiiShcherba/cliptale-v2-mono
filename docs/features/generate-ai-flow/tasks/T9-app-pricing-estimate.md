---
id: T9
title: "Implement static flow-pricing table + cost-estimate service"
layer: "app"
deps: ["T5"]
acs: ["AC-11"]
files_hint: ["apps/api/src/lib/flow-pricing.ts", "apps/api/src/services/flow-generate.service.ts"]
owner: "Backend Lead"
estimate: "S"
status: "todo"
---

# T9 — flow-pricing table + cost-estimate service

## Why

The cost confirmation needs a number, but the catalog carries no pricing and providers bill on actuals — so a best-effort static estimate backs the pre-flight gate. Derives from [ADR-0005](../adr/0005-surface-cost-via-a-preflight-estimate-endpoint-and-static-pricing.md), [sad §4 / §8 Cost-safety gate](../sad.md), [spec §8 OQ (cost source) + §AC-11](../spec.md).

## What

- `apps/api/src/lib/flow-pricing.ts`: a static per-model price table (`modelId → { currency, amount }`).
- An estimate path on `flow-generate.service` (or a small estimate service): read the saved canvas, resolve the target block's model, return a best-effort `Money` with `bestEffort: true`. Non-mutating, no provider call. Unknown model → a typed 422 (`flow.block_not_found`) per the contract.

## Definition of Done

- [ ] Estimate returns a `Money` + `bestEffort: true` for a known generation block
- [ ] An unknown/non-generation block id → the 422 contract shape (no estimate)
- [ ] No mutation and no provider call on the estimate path
- [ ] Unit tests cover known + unknown model; lint + vet clean

## Notes

Shares the `flow-generate.service.ts` lane with T11/T12 (overlapping `files_hint` → serialized). Pricing drift is accepted debt (sad §11) — label estimates best-effort. Pairs with the estimate endpoint (T15).
