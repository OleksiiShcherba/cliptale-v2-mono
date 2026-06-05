---
status: Accepted
owner: "Architect / Tech Lead"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-06-05"
feature_size: "M"
ticket: "n/a"
---

# 0004 — Store per-user preferences in a user_settings JSON table

- **Status:** Accepted
- **Date:** 2026-06-05
- **Deciders:** Architect + Steven Hayes (PM), Socratic walk §4

## Context

Autosave interval — перша персональна (per-account) преференція продукту; специфікація (Goal 3) явно називає нову Settings-сторінку «домом для цієї та майбутніх преференцій». Жодного user-global сховища налаштувань у схемі ще немає; найближчий прецедент — `user_project_ui_state` (user_id + project_id, JSON), але він per-project.

## Decision drivers

- Spec Goal 3: «scaffolding first» — сховище має приймати майбутні преференції без переробки.
- AC-10: налаштування слідує за акаунтом (per-account, не per-browser/per-draft) — інваріант CONTEXT.
- AC-11c / §6.1: читає й пише лише власник акаунта.
- Конвенції §2: Zod-валідація в app-шарі — норма репозиторію; прецедент JSON-стейту вже є.

## Considered options

1. **Таблиця `user_settings` із JSON** — `user_id` (PK, FK на users) + `settings_json` + `updated_at`; інтервал — поле в JSON; Zod валідує білий список пресетів (30/60/120/300/600 с).
2. **Вузька таблиця `user_autosave_settings`** — `user_id` + `interval_seconds INT` із CHECK.
3. **Колонка в таблиці `users`** — `ALTER TABLE users ADD autosave_interval_seconds`.

## Decision outcome

**Chosen:** Option 1 — узагальнена `user_settings`. Вузька таблиця означає нову таблицю або міграцію даних під кожну наступну преференцію (а специфікація прямо обіцяє майбутні); колонка в `users` забруднює центральну auth-таблицю продуктовими преференціями і вимагає ALTER гарячої таблиці на кожне нове поле.

## Consequences

**Positive**
- Наступна преференція = поле в JSON + рядок у Zod-схемі, без DDL.
- Повторює знайомий патерн (`user_project_ui_state`) — нульова новизна для коду читання/запису.

**Negative**
- БД не типізує вміст JSON — валідація цілком в app-шарі (для цього репозиторію це вже норма: Zod скрізь).

**Neutral**
- Точна форма (charset, дефолти, індекси) і міграція `050_user_settings.sql` — на етапі `data-model`.

## Links

- Spec: [[../spec.md]] US-06, AC-09…AC-11c; §2 Goal 3
- SAD: [[../sad.md]] §4, §5
- Related ADR: [[0001-fullstack-web-and-backend-surfaces]]
