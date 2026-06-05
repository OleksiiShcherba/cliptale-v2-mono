---
id: T3
title: "Settings repository + service: effective read with defaults, lazy upsert"
layer: "infra"
deps: ["T1"]
acs: ["AC-09", "AC-10", "AC-11b"]
files_hint:
  - "apps/api/src/repositories/settings.repository.ts"
  - "apps/api/src/services/settings.service.ts"
owner: "Oleksii (solo dev)"
estimate: "S"
status: "todo"
---

# T3 — Settings repository + service: effective read with defaults, lazy upsert

## Why

Новий бекенд-домен settings ([sad §5](../sad.md) — окремий ланцюг, не вштовхнутий у storyboard) обслуговує читання інтервалу при відкритті дошки та upsert із Settings-сторінки ([sad §6 «Читання autosave interval»](../sad.md), [ADR-0004](../adr/0004-user-settings-json-table.md)).

## What

- `settings.repository.ts`: point-lookup за `user_id` (PK) + single-row upsert (`INSERT ... ON DUPLICATE KEY UPDATE`) `settings_json`; raw SQL через `mysql2` pool — за патерном існуючих репозиторіїв.
- `settings.service.ts`: `getEffectiveSettings(userId)` — рядка немає → app-шар-дефолти (`autosaveIntervalSeconds: 60`, `updatedAt: null`); `updateSettings(userId, patch)` — lazy upsert, повертає збережений стан. Без `req/res` (конвенція services).

## Definition of Done

- [ ] Інтеграційні тести (живий MySQL, co-located `*.test.ts`): відсутній рядок → дефолт 60/`updatedAt:null`; upsert створює рядок; повторний upsert оновлює без дубля; `updated_at` рухається
- [ ] Фікстура `insertUserSettings(pool, userId, …)` за data-model §Test fixtures (email лише `@example.test`)
- [ ] Юніт-логіка дефолтів не залежить від контролера (сервіс тестовний окремо)
- [ ] lint + typecheck не гірші за базлайн

## Notes

Ownership AC-11c тут структурний: сервіс приймає лише `userId` запитувача — кросс-акаунтного шляху не існує (перевіряється на ports-рівні, T4). Запускати vitest з `apps/web-editor`-аналогом для api за конвенцією репо.
