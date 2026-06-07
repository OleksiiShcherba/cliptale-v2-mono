---
id: T11
title: "Apply the reference boundary in the worker scene generation master: primary + top-up selection, draft-global derived style description"
layer: "app"
deps: ["T2", "T3"]
acs: ["AC-08b", "AC-09"]
files_hint:
  - "apps/media-worker/src/jobs/storyboardOpenAIImage.job.ts"
  - "apps/media-worker/src/jobs/referenceSelection.ts"
  - "apps/media-worker/src/jobs/referenceSelection.test.ts"
owner: "Oleksii"
estimate: "L"
status: "todo"
---

# T11 — Scene generation master: reference boundary + style description

## Why

[ADR-0007](../adr/0007-style-description-from-starred-results-at-generation-time.md) + [ADR-0008](../adr/0008-primary-star-topped-up-to-model-capacity.md): вибір референсів сцени і драфт-глобальний style description. [sad §6 Flow 2](../sad.md), reference boundary — AC-09.

## What

Чиста логіка вибору в новому `referenceSelection.ts` + інтеграція в scene-master шлях (точний handler звірити по місцю — `storyboardOpenAIImage.job.ts` або відповідний scene-illustration handler):

- Кандидати сцени X: **primary star кожного лінкованого блока**, далі добір рештою зірок до reference-місткості моделі; зображення нелінкованих блоків **ніколи** не потрапляють у X.
- Сцени без лінкованих блоків: prompt + **одна драфт-глобальна** derived style description, побудована зі starred results у момент генерації; немає жодної зірки в драфті → fallback на скрипт (AC-08b).
- Style description кешується на запуск набору (одна на драфт, не на сцену).

## Definition of Done

- [ ] Юніт-тести referenceSelection: primary-first, top-up до місткості, відсікання понад місткість, нуль витоку нелінкованих
- [ ] Тест: style description одна на драфт; з зірками — зі starred results, без — зі скрипта
- [ ] Інтеграційний тест: payload генерації сцени X містить лише файли зірок лінкованих блоків
- [ ] lint + typecheck не гірші за baseline

## Notes

Legacy principal-image шлях у master-а лишається для старих драфтів (spec §3 — без міграції); нова гілка вмикається наявністю reference-блоків у драфта.
