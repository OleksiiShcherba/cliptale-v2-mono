---
id: T14
title: "Expose block CRUD, retry, scene-links and star endpoints per the OpenAPI contract"
layer: "ports"
deps: ["T8", "T9", "T13"]
acs: ["AC-04", "AC-06", "AC-10", "AC-11", "AC-13", "AC-14"]
files_hint:
  - "apps/api/src/routes/storyboard-references.routes.ts"
  - "apps/api/src/controllers/storyboardReference.controller.ts"
  - "apps/api/src/controllers/storyboardReference.controller.schemas.ts"
owner: "Oleksii"
estimate: "M"
status: "todo"
---

# T14 — Ports: blocks / retry / scene-links / stars

## Why

Решта HTTP-поверхні домену за [contracts/openapi.yaml](../contracts/openapi.yaml). Сервіси — T8/T9.

## What

Розширення файлів T13:

- `GET|POST /…/references/blocks` (`listReferenceBlocks`, `createReferenceBlock` — ручний блок, AC-11).
- `PATCH|DELETE /…/references/blocks/{blockId}` (`updateReferenceBlock`, `deleteReferenceBlock` — AC-14).
- `POST /…/blocks/{blockId}/retry` (`retryReferenceBlockGeneration` — AC-04).
- `PUT /…/blocks/{blockId}/scene-links` (`saveSceneLinks`) — тіло з `version`; conflict сервісу → **409** за контрактом (reload prompt на фронті).
- `PUT|DELETE /…/blocks/{blockId}/stars/{fileId}` (`starReferenceResult` з опційним `primary`, `unstarReferenceResult` — AC-06).

## Definition of Done

- [ ] Контролерні тести: усі 8 операцій збігаються з openapi.yaml (форми, статус-коди, помилки)
- [ ] Тест: saveSceneLinks зі stale version → 409 контрактної форми
- [ ] Тест: не-власник на кожен ендпоінт → контрактна відмова (AC-13)
- [ ] lint + typecheck не гірші за baseline

## Notes

Та сама lane, що T13 (спільні файли). Rate limits — існуючі creation/generation ліміти, нових не вводити (spec §6.1).
