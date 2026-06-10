---
id: T6
title: "Delete the four principal-image routes and update the API contract package"
layer: "ports"
deps: ["T5"]
acs: ["AC-02", "AC-04b", "AC-08"]
files_hint:
  - "apps/api/src/routes/storyboard.routes.ts"
  - "apps/api/src/controllers/storyboardIllustration.controller.ts"
  - "packages/api-contracts/src/openapi.ts"
  - "packages/api-contracts/src/openapi.storyboard.paths.test.ts"
owner: "Oleksii"
estimate: "M"
status: "todo"
---

# T6 — Видалити principal-endpoints + оновити contract package

## Why

Чотири principal-image routes видаляються (не stub, не 410 — removed; Express відповідає 404) — [contracts/openapi.yaml §removals](../contracts/openapi.yaml), [ADR-0004](../adr/0004-retire-principal-image-by-ignoring-it-on-read.md). Конвенція репо: `packages/api-contracts/src/openapi.ts` оновлюється тим самим комітом ([sad §2 Conventions](../sad.md)).

## What

- `routes/storyboard.routes.ts`: видалити `…/illustrations/principal-image/{approve,edit,replace}` (POST) і `…/principal-image/references` (PUT).
- `controllers/storyboardIllustration.controller.ts`: видалити відповідні хендлери; решта хендлерів повертає ревізований status-shape (T5) і нові 422-гілки (T2/T3/T4).
- `packages/api-contracts/src/openapi.ts`: прибрати principal-шляхи (рядки ~1403+), прибрати principal-фрази з описів готовності (~869, ~946), оновити status-схему й задокументувати 422-коди `references.reference_gate_failed` / `references.unlinked_scenes`.
- Видалити мертвий principal-код, що звільнився після T5 (`storyboardIllustrationReference.repository.ts` і його тести — якщо споживачів не лишилось).

## Definition of Done

- [ ] Виклик кожного з 4 видалених шляхів повертає 404 (інтеграційний тест).
- [ ] `openapi.storyboard.paths.test.ts` оновлено й зелений; contract і router узгоджені в одному коміті.
- [ ] POST start повертає 202 зі status body / 422 з details — відповідає [openapi.yaml](../contracts/openapi.yaml) прикладам.
- [ ] lint + typecheck чисті.

## Notes

GET status — breaking для клієнтів, що рендерять principal-крок; web-editor знімає його в T9 цієї ж фічі (контракт фіксує `additionalProperties: false`).
