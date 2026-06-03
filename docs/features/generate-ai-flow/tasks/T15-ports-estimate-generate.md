---
id: T15
title: "Add estimate + generate controllers + routes (422/429 mapping, Idempotency-Key) + OpenAPI"
layer: "ports"
deps: ["T9", "T11", "T12"]
acs: ["AC-01", "AC-03", "AC-05", "AC-06", "AC-17"]
files_hint: ["apps/api/src/controllers/generation-flow.controller.ts", "apps/api/src/routes/generation-flows.routes.ts", "apps/api/src/lib/errors.ts", "packages/api-contracts/src"]
owner: "Backend Lead"
estimate: "M"
status: "todo"
---

# T15 — estimate + generate controllers + routes

## Why

The HTTP surface for the spend path: the pre-flight estimate and the server-authoritative Generate, with the full error-code matrix the client branches on. Derives from [openapi.yaml .../estimate + .../generate](../contracts/openapi.yaml), [sad §6 Flow 1 & 7 / §8](../sad.md), [ADR-0004](../adr/0004-rate-limit-generate-with-a-per-creator-redis-sliding-window.md), [ADR-0005](../adr/0005-surface-cost-via-a-preflight-estimate-endpoint-and-static-pricing.md), [spec §AC-01/03/05/06/17/11](../spec.md).

## What

- `POST /generation-flows/:flowId/blocks/:blockId/estimate` → the T9 estimate (200 `CostEstimate`; unknown/non-generation block → 422 `flow.block_not_found`).
- `POST /generation-flows/:flowId/blocks/:blockId/generate` → requires the `Idempotency-Key` header; calls T12 `generate`; maps gate failures to **422** (`flow.required_input_missing` / `exclusivity_violation` / `asset_missing` / `content_invalid`), rate-limit to **429** with `Retry-After`, stale version to **409**, never-owned → **404**; 202 `GenerateAccepted` on success.
- Add a **429 sentinel** to `apps/api/src/lib/errors.ts` (api-sync-report drift point 2 — no 429 sentinel today).
- Update the OpenAPI in the same commit.

## Definition of Done

- [ ] Estimate + generate endpoints exist; `Idempotency-Key` is required on generate
- [ ] Every gate failure maps to its spec'd code/status (422 matrix, 429+Retry-After, 409, 404)
- [ ] A 429 error sentinel exists in `errors.ts` and the central handler maps it
- [ ] Controller tests cover the branch matrix; OpenAPI updated same commit
- [ ] lint + vet clean

## Notes

Depends on T9 (estimate) + T11 (gate) + T12 (enqueue). Shares the controller/routes files with T14 (serialized lane). The server is authoritative — `acknowledgedCost` from the client is advisory only.
