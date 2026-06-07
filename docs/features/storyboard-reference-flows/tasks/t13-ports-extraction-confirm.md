---
id: T13
title: "Expose extraction + confirm endpoints (routes, controller, Zod schemas) per the OpenAPI contract"
layer: "ports"
deps: ["T4", "T6"]
acs: ["AC-01", "AC-01b", "AC-03", "AC-13"]
files_hint:
  - "apps/api/src/routes/storyboard-references.routes.ts"
  - "apps/api/src/controllers/storyboardReference.controller.ts"
  - "apps/api/src/controllers/storyboardReference.controller.schemas.ts"
owner: "Oleksii"
estimate: "M"
status: "todo"
---

# T13 — Ports: extraction + confirm

## Why

HTTP-поверхня домену за [contracts/openapi.yaml](../contracts/openapi.yaml): `startCastExtraction`, `getCastExtraction`, `confirmCast`. Сервіси — T4/T6.

## What

Новий route-файл + controller + Zod-схеми (конвенція routes → controllers → services), реєстрація в кореневому router:

- `POST /storyboards/{draftId}/references/extract` → T4.startExtraction; повтор при існуючих блоках → контрактна помилка (AC-01b).
- `GET /storyboards/{draftId}/references/extraction` → T4.getExtraction (reattach-fallback).
- `POST /storyboards/{draftId}/references/confirm` → T6; тіло = відкоригований каст; відповідь — блоки + статуси вікна.
- Не-власник → відмова в not-found-стилі без розкриття існування (AC-13).

## Definition of Done

- [ ] Контролерні тести: статус-коди, форми запиту/відповіді і помилок збігаються з openapi.yaml для всіх трьох операцій
- [ ] Тест: не-власник на кожен ендпоінт → контрактна відмова
- [ ] Route зареєстровано; існуючий auth-middleware застосований
- [ ] lint + typecheck не гірші за baseline

## Notes

Спільні файли з T14 — одна lane (T14 залежить від T13). Жодної бізнес-логіки в контролері.
