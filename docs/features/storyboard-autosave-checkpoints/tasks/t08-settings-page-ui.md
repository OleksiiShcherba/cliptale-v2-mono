---
id: T8
title: "Settings feature module: page with interval presets, route, Home menu item"
layer: "ui"
deps: []
acs: ["AC-09", "AC-11"]
files_hint:
  - "apps/web-editor/src/features/settings/"
  - "apps/web-editor/src/main.tsx"
  - "apps/web-editor/src/features/home/components/HomeSidebar.tsx"
owner: "Oleksii (solo dev)"
estimate: "M"
status: "todo"
---

# T8 — Settings feature module: page with interval presets, route, Home menu item

## Why

Перша per-user Settings-сторінка (spec Goal 3, US-06) — новий фіча-модуль [sad §5](../sad.md) `features/settings/`; помилкові гілки — [sad §6 «Зміна autosave interval»](../sad.md); контракт — [openapi.yaml](../contracts/openapi.yaml) §`/users/me/settings`.

## What

- `features/settings/{components/SettingsPage.tsx, components/SettingsPage.styles.ts, api.ts, types.ts}` — за шаблоном фіча-модуля (карта архітектури: modelled on generate-wizard). `api.ts` — GET/PUT через `apiClient` (`lib/api-client.ts`) + TanStack Query (ключ settings, інвалідація після PUT — sad §8).
- Пресети 30 с / 1 / 2 / 5 / 10 хв; підтвердження збереження (AC-09); збій PUT → повідомлення «зміну не збережено», показується попередній збережений інтервал (AC-11); збій GET — сторінка не блокується, показує дефолт із позначкою.
- **Reuse:** існуючі shared-компоненти `apps/web-editor/src/shared/components/`, інлайн `*.styles.ts` із токенами палітри (`#0D0D14`/`#16161F`/`#252535`/`#F0F0FA`, Inter — карта §Frontend); нових прімітивів не створювати, якщо існуючий пасує.
- Роут `/settings` у `main.tsx` під `<ProtectedRoute>`; пункт Settings у `HomeSidebar.tsx` (ліве меню Home — spec US-06).

## Definition of Done

- [ ] Компонентні тести (Vitest, мокнутий apiClient): рендер пресетів із збереженим значенням; вибір пресета → PUT і підтвердження; PUT-збій → повідомлення + старе значення; GET-збій → дефолт без блокування
- [ ] Роут `/settings` захищений; пункт меню в HomeSidebar веде на нього (тест навігації)
- [ ] Стилі лише через co-located `*.styles.ts`; жодного нового styling-підходу
- [ ] lint + typecheck не гірші за базлайн

## Notes

Без deps: будується проти зафіксованого контракту з мокнутим API (бекенд T4 інтегрується в e2e T15). `api.ts` цього модуля — також джерело читання інтервалу для планувальника (T10).
