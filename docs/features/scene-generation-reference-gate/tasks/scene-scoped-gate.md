---
id: T4
title: "Scope the per-scene regeneration gate to the blocks linked to that scene"
layer: "app"
deps: ["T3"]
acs: ["AC-03", "AC-03b"]
files_hint:
  - "apps/api/src/services/storyboardIllustration.service.ts"
  - "apps/api/src/services/storyboardIllustration.service.test.ts"
owner: "Oleksii"
estimate: "S"
status: "todo"
---

# T4 — Scene-scoped gate для per-scene регенерації

## Why

Регенерація однієї сцени гейтиться лише на її лінковані блоки — [spec AC-03/AC-03b](../spec.md), [sad §6 Flow 2](../sad.md), читання Q2 — [data-model.md](../data-model.md).

## What

У `storyboardIllustration.service.ts` замінити `assertSceneStarGate` (рядок ~86) на scene-scoped Reference-done gate: блоки, лінковані до S (Q2 з T1), мусять бути ready; not-ready → `ReferenceNotReadyError` із named блоками **лише цієї сцени**; нуль лінкованих блоків → pass (сцена генерується з промпта + style). Ownership — як у T3.

## Definition of Done

- [ ] Unit-тести: not-ready нелінкований блок не блокує S (AC-03); not-ready лінкований блокує з named-block (AC-03b); zero linked → pass.
- [ ] `assertSceneStarGate` видалено; жодних звернень до зірок як precondition.
- [ ] lint + typecheck чисті.

## Notes

Той самий файл, що T3/T5 — одна lane. Per-scene обхід full-set гейта — прийнятний by design (spec §6.1 abuse case).
