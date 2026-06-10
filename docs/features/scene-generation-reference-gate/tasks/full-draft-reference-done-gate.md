---
id: T3
title: "Replace the full-draft star gate with the Reference-done gate in the illustration service"
layer: "app"
deps: ["T1", "T2"]
acs: ["AC-01", "AC-02", "AC-04", "AC-04b", "AC-07", "AC-09"]
files_hint:
  - "apps/api/src/services/storyboardIllustration.service.ts"
  - "apps/api/src/services/storyboardIllustration.service.test.ts"
  - "apps/api/src/services/storyboardIllustration.starGate.service.test.ts"
owner: "Oleksii"
estimate: "M"
status: "todo"
---

# T3 — Full-draft Reference-done gate у сервісі

## Why

Серце фічі: правило гейта — [ADR-0002](../adr/0002-gate-on-persisted-reference-output-existence.md), потік — [sad §6 Flow 1 + Flow 4](../sad.md), контракт POST-старту — [contracts/openapi.yaml](../contracts/openapi.yaml).

## What

У `storyboardIllustration.service.ts` замінити `assertFullSetStarGate` (рядок ~58) на Reference-done gate:

1. owner-scoped resolve **перед** будь-якою оцінкою (наявний механізм, AC-09);
2. кожен блок ready за Q1 (T1) — інакше `ReferenceNotReadyError` із named blocks (AC-02; still-generating = немає output, AC-07);
3. якщо блоків ≥1 — кожна сцена лінкована за Q3, інакше `ReferenceNotReadyError` з named scenes (AC-04b);
4. нуль блоків → pass (AC-04).

Жодного виклику провайдера на цьому шляху (hard rule, spec §6).

## Definition of Done

- [ ] Unit-тести сервісу: happy (всі ready + всі лінковані) → старт; not-ready (кожен різновид) → 422 з усіма blocking-блоками; unlinked scene → 422 з named сценами; zero-ref → старт; non-owner → 404 без деталей.
- [ ] `assertFullSetStarGate` видалено; `storyboardIllustration.starGate.service.test.ts` переписано/перейменовано під новий гейт.
- [ ] Перевірено (тест/код-рев'ю): gate-шлях не enqueue-ить і не викликає генерацію.

## Notes

Lane: `storyboardIllustration.service.ts` спільний із T4/T5 — задачі серіалізовані через deps. Гейт — one-shot snapshot на старті (OQ-3 default, accepted debt sad §11).
