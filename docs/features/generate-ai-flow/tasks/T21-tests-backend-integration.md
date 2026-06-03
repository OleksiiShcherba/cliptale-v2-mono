---
id: T21
title: "Backend integration suite — authz, optimistic-lock, rate-limit, validation gate, result integrity"
layer: "tests"
deps: ["T14", "T15", "T13"]
acs: ["AC-03", "AC-04", "AC-05", "AC-06", "AC-10b", "AC-17"]
files_hint: ["apps/api/src/services/flow-generate.service.integration.test.ts", "apps/api/src/controllers/generation-flow.controller.test.ts"]
owner: "Backend Lead / QA"
estimate: "M"
status: "todo"
---

# T21 — Backend integration suite

## Why

The three top quality goals (cost-safety, owner-scoped confidentiality, durability) are server-authoritative — they must be proven against real MySQL/Redis, not mocked. Derives from [sad §10 QG-1/QG-2/QG-3 (How verify)](../sad.md), [spec §6 result integrity + §6.1](../spec.md), [spec §AC-03/04/05/06/10b/17](../spec.md).

## What

Integration tests (Vitest against real MySQL + Redis, `singleFork`, run from `apps/web-editor`/api workspace) covering:
- **AuthZ (QG-2):** every flow operation + Generate by a non-owner → 404; a never-owned asset reference → 404.
- **Optimistic lock (AC-10b):** a concurrent canvas save with a stale version → 409, first save authoritative.
- **Rate limit:** scripting Generate past 30/min → 429 with Retry-After.
- **Validation gate (Flow 7):** each failure → its 422 code (`required_input_missing`/`exclusivity_violation`/`asset_missing`/`content_invalid`).
- **Result integrity (QG-1):** a forced-failure job → library-write reconciliation shows zero assets; a success → exactly one asset + one link.

## Definition of Done

- [ ] Each bullet above is a passing test using the seeded test user + a flow factory (hardcoded UUIDs, minimal valid canvas, `version=1`) per data-model §Seeds
- [ ] PII guard honored in fixtures (`user-<uuid>@example.test` / `Test Creator`)
- [ ] Suite is green from a clean DB
- [ ] lint + vet clean

## Notes

Depends on T14 + T15 (endpoints) + T13 (worker integrity path). Respect the repo gate realities: run vitest from the correct workspace; the E2E seed user + 15-min login rate limit apply to the E2E task (T22), not here.
