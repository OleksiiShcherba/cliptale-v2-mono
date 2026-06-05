---
id: T4
title: "Settings endpoints: GET/PUT /users/me/settings with preset whitelist"
layer: "ports"
deps: ["T3"]
acs: ["AC-09", "AC-10", "AC-11", "AC-11c"]
files_hint:
  - "apps/api/src/routes/settings.routes.ts"
  - "apps/api/src/controllers/settings.controller.ts"
  - "apps/api/src/index.ts"
  - "packages/api-contracts/src/openapi.ts"
owner: "Oleksii (solo dev)"
estimate: "M"
status: "todo"
---

# T4 — Settings endpoints: GET/PUT /users/me/settings with preset whitelist

## Why

Контрактна пара [openapi.yaml](../contracts/openapi.yaml) §`/users/me/settings` — перший per-user settings surface (spec §6.1: security review required). Помилкові гілки — [sad §6 «Зміна autosave interval»](../sad.md).

## What

- `settings.routes.ts`: `GET` + `PUT /users/me/settings` за ланцюгом `authMiddleware → aclMiddleware('editor') → validateBody → controller` (как у `storyboard.routes.ts`); реєстрація в `apps/api/src/index.ts`.
- `settings.controller.ts`: Zod-схема body — `autosaveIntervalSeconds` лише з білого списку `[30, 60, 120, 300, 600]` (ADR-0004); інше → 400 з plain-language `{ error }`. Виклики `settings.service` з `req.user.userId` — me-scoped структурно (AC-11c: чужий акаунт неадресовний).
- Оновити hand-maintained `packages/api-contracts/src/openapi.ts` тим самим комітом (правило карти архітектури «spec and implementation can drift»).

## Definition of Done

- [ ] Інтеграційні тести: GET без рядка → 200 + дефолти/`updatedAt:null`; PUT 120 → 200 + збережено; PUT 45 → 400; без токена → 401
- [ ] Відповіді відповідають контракту (`UserSettings` / `UserSettingsUpdate` — required-поля, `additionalProperties:false`)
- [ ] `packages/api-contracts/src/openapi.ts` оновлено в тому ж коміті
- [ ] lint + typecheck не гірші за базлайн

## Notes

NFR: settings read ≤ 300 мс p95 — point-lookup по PK (T3), на ports-рівні нічого важкого не додавати. Жодного `userId` в path/query — лише `me`.
