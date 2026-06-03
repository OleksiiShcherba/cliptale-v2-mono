---
id: T11
title: "Implement the server-authoritative Generate validation gate"
layer: "app"
deps: ["T6", "T5"]
acs: ["AC-03", "AC-04", "AC-05", "AC-06", "AC-17"]
files_hint: ["apps/api/src/services/flow-generate.service.ts"]
owner: "Backend Lead"
estimate: "L"
status: "todo"
---

# T11 — Generate validation gate

## Why

The heart of cost-safety: before any provider call, the server re-validates every precondition so a paid generation never runs on a bad graph — and so the UI can never be the only gate. Derives from [sad §4 strategic choice 3 / §6 Flow 7 / §8 Cost-safety gate](../sad.md), [ADR-0004](../adr/0004-rate-limit-generate-with-a-per-creator-redis-sliding-window.md), [ADR-0006](../adr/0006-declare-modality-and-exclusivity-groups-in-the-model-catalog-schema.md), [spec §AC-03/04/05/06/17](../spec.md).

## What

In `apps/api/src/services/flow-generate.service.ts`, a `validate(flowId, blockId, userId)` that loads the canvas (owner-scoped) and checks, in order: owner (non-owner/never-owned → `NotFoundError`); every required input of the block's model resolved by a compatible connection (AC-03); exactly-one-of `exclusiveGroup` satisfied (AC-06); content blocks non-empty / valid media type+size (AC-17); referenced library assets present — and the "missing asset, replace it" message **only** for a previously-owned asset, never-owned → 404 (AC-05). Each failure raises a typed error carrying the contract `code` (`flow.required_input_missing` / `flow.exclusivity_violation` / `flow.asset_missing` / `flow.content_invalid`). Modality + exclusivity read from the T5 catalog.

## Definition of Done

- [ ] Each precondition has a dedicated branch raising its typed error with the correct `code` and `details`
- [ ] Never-owned asset → `NotFoundError` (404); previously-owned-but-gone → `flow.asset_missing` (422) — the two are distinct
- [ ] No provider call / enqueue happens on any failure
- [ ] Unit tests cover every branch (missing input, both/neither alternative, empty text, invalid media, missing asset, non-owner)
- [ ] lint + vet clean

## Notes

Shares `flow-generate.service.ts` with T9 + T12 (serialized lane). The exclusivity + modality rules MUST read the catalog (T5), not a hardcoded copy. This is the security-review surface (sad §5) — keep it isolated and independently testable.
