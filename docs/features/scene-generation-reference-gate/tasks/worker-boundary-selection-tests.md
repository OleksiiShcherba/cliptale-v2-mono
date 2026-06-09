---
id: T12
title: "Add worker tests for the reference boundary invariant and selection"
layer: "tests"
deps: ["T8"]
acs: ["AC-04", "AC-05", "AC-06", "AC-06b", "AC-08"]
files_hint:
  - "apps/media-worker/src/jobs/storyboardOpenAIImage.job.integration.test.ts"
  - "apps/media-worker/src/jobs/referenceSelection.test.ts"
owner: "Oleksii"
estimate: "M"
status: "todo"
---

# T12 — Worker-тести boundary-інваріанта + selection

## Why

NFR «Reference-boundary correctness: 0 scenes fed an output from an unlinked block — invariant assertion covered by automated tests» ([spec §6](../spec.md), verbatim) + [sad §10 QG-2](../sad.md), [sad §6 Flow 3](../sad.md).

## What

- **Інваріант (AC-05):** інтеграційний тест scene-джоби — сцена S, лінкована до частини блоків: у generation inputs потрапляють **тільки** selected outputs лінкованих блоків; output нелінкованого блока недосяжний для S.
- **Selection (AC-06/AC-06b):** primary-star-usable / star-on-deleted-output → fallback latest / no-star → latest; крізь повну джобу, не лише unit T7.
- **AC-04:** zero-ref сцена — prompt + style, нуль reference-inputs.
- **AC-08:** legacy principal-рядок не потрапляє в inputs jобі (регресія ignore-on-read).

## Definition of Done

- [ ] Інваріант-assertion сформульований явно (перелік прочитаних file_id ⊆ selected outputs лінкованих блоків) і зелений.
- [ ] Усі selection-гілки покриті на рівні джоби.
- [ ] Провайдер замокано на межі клієнта (генерацію не викликаємо), БД — жива, стиль наявних `*.integration.test.ts`.

## Notes

Lane спільна з T7/T8 (worker jobs). Це доказова база для KPI `reference_utilization_rate` — лог/телеметрію не додаємо, інваріант доводимо тестами.
