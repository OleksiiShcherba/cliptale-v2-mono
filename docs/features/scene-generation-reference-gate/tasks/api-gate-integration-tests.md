---
id: T11
title: "Add API integration tests for the gate against live MySQL"
layer: "tests"
deps: ["T6"]
acs: ["AC-01", "AC-02", "AC-03", "AC-03b", "AC-04", "AC-04b", "AC-07", "AC-08", "AC-09"]
files_hint:
  - "apps/api/src/__tests__/integration/storyboard-illustration-endpoints.test.ts"
owner: "Oleksii"
estimate: "M"
status: "todo"
---

# T11 — API-інтеграційні тести гейта (live MySQL)

## Why

Endpoint-рівнева верифікація всіх gate-AC проти живої БД — [spec §5](../spec.md), сидери — [data-model §Test fixtures](../data-model.md), очікувані wire-форми — [contracts/openapi.yaml](../contracts/openapi.yaml), QG-1/QG-3 — [sad §10](../sad.md).

## What

Розширити `storyboard-illustration-endpoints.test.ts` (live MySQL, serial, без моків БД):

- AC-01: всі ready + всі лінковані → 202, джоби enqueue-яться.
- AC-02/AC-07: not-ready різновиди (running-без-output, failed-без-output, порожній, manual без flow) → 422 з усіма named-блоками.
- AC-03/AC-03b: per-scene scope (нелінкований not-ready не блокує / лінкований блокує).
- AC-04: zero-ref драфт → 202. AC-04b: ready-блоки + сцена без лінка → 422 з named-сценами.
- AC-08: seeded legacy principal-рядок (`seedLegacyPrincipal`) нічого не змінює; 4 principal-шляхи → 404.
- AC-09: non-owner → 404 без розкриття стану (тіло без blocks/scenes).
- **No-provider-call (spec §6):** на gate-шляху (start-відмова + status read) не відбувається жодного виклику провайдера/enqueue платної генерації.

## Definition of Done

- [ ] Усі перелічені кейси зелені проти live MySQL (`singleFork`, vitest); сидери — стиль репо (`<id>@example.test`).
- [ ] 422-тіла валідні проти прикладів openapi.yaml (`error` + `code` + `details`).
- [ ] Жодного мока БД в інтеграційних тестах (правило репо).

## Notes

Інтеграційні тести потребують живої MySQL і повільні — не ганяти у watch. Pre-existing lint/typecheck-падіння репо не блокують DoD (зафіксована реальність гейтів).
