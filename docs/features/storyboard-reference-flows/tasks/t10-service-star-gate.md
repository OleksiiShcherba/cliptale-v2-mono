---
id: T10
title: "Enforce the star gate in the storyboard illustration service (full-set, per-scene scope, zero-blocks pass)"
layer: "app"
deps: ["T2", "T3"]
acs: ["AC-04", "AC-08", "AC-08b"]
files_hint:
  - "apps/api/src/services/storyboardIllustration.service.ts"
  - "apps/api/src/services/storyboardIllustration.validation.ts"
  - "apps/api/src/controllers/storyboardIllustration.controller.ts"
owner: "Oleksii"
estimate: "M"
status: "todo"
---

# T10 — Star gate в illustration service

## Why

[ADR-0011](../adr/0011-star-gate-in-api-service-at-generation-start.md): гейт в API-сервісі на старті генерації. [sad §6 Flows 2, 7](../sad.md).

## What

Мінімальна точка дотику в `storyboardIllustration.service.ts` / `.validation.ts`:

- **Full-set** (`startStoryboardIllustrations`): кожен reference-блок драфта має ≥1 зірку, інакше відмова з **точним списком блоків без зірок** plain-language; блок без результатів (failed/порожній) рахується без зірки, повідомлення містить дії-виходи retry/delete (AC-04).
- **Per-scene** (`startStoryboardBlockIllustration` для сцени X): перевіряються лише блоки, лінковані до X.
- **Zero-blocks pass**: драфт без reference-блоків проходить гейт (генерація за no-linked-blocks правилом AC-09).
- Контрактна форма відмови — за [openapi.yaml](../contracts/openapi.yaml) (контролерна дельта тут же).

## Definition of Done

- [ ] Тест: 1 з 3 блоків без зірки → full-set відмова називає саме його; всі зіркові → старт
- [ ] Тест: regenerate сцени X блокується лише незірковими блоками, лінкованими до X; незірковий блок, не лінкований до X, не блокує
- [ ] Тест: нуль блоків → гейт пройдено
- [ ] Тест: failed-блок без результатів → у списку гейта з retry/delete-діями
- [ ] lint + typecheck не гірші за baseline

## Notes

Прийнятий борг: TOCTOU-вікно гейта — генерація йде зі знімком зірок на момент старту (sad §11), додаткових локів не вводити.
