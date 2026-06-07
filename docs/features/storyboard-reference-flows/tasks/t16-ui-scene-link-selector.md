---
id: T16
title: "Build the SceneLinkSelector multi-select + visible linked-scenes list with 409 reload prompt"
layer: "ui"
deps: ["T14"]
acs: ["AC-10", "AC-10b"]
files_hint:
  - "apps/web-editor/src/features/storyboard/components/SceneLinkSelector.tsx"
  - "apps/web-editor/src/features/storyboard/components/SceneLinkSelector.test.tsx"
owner: "Oleksii"
estimate: "M"
status: "todo"
---

# T16 — UI: SceneLinkSelector + reload prompt

## Why

Єдиний мульти-селект сцен — і на блоці, і в модалці касту (AC-01 вимагає «той самий селектор»). [sad §6 Flow 5](../sad.md).

## What

**Reuse:** селект/чекбокс-примітиви з `shared/components/`, дані сцен зі стора сторіборда. **Новий компонент:** `SceneLinkSelector` (мульти-селект сцен драфта + видимий список лінкованих) — існуючого мульти-селекту сцен немає.

- Додавання/зняття окремих сцен; видимий linked-scenes список на блоці (AC-10).
- Save → `saveSceneLinks` з поточною `version`; **409 → reload prompt** (правки не губляться мовчки — NFR concurrency), після reload — свіжі лінки + version.
- Видалена сцена зникає зі списку (бекенд-каскад, AC-10b); нова сцена — без авто-лінків; reorder нічого не міняє.

## Definition of Done

- [ ] Компонентні тести: add/remove оновлює список; save шле version
- [ ] Тест: 409 → reload prompt, без мовчазної втрати правок
- [ ] Тест: сцени, видалені з драфта, не показуються в списку
- [ ] lint + typecheck не гірші за baseline

## Notes

Паралельна гілка з T15/T18; T17 (модалка касту) реюзає цей компонент — звідси dep T17→T16.
