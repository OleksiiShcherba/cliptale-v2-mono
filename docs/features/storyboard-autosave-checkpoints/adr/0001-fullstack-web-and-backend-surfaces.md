---
status: Accepted
owner: "Architect / Tech Lead"
reviewers: ["Tech Lead"]
updated_at: "2026-06-05"
feature_size: "M"
ticket: "n/a"
---

# 0001 — Deliver the feature across web-frontend and backend-service surfaces

- **Status:** Accepted
- **Date:** 2026-06-05
- **Deciders:** Architect + Steven Hayes (PM), Socratic walk §4

## Context

Фіча storyboard-autosave-checkpoints розділяє збереження дошки на lightweight autosave і checkpoint save зі скриншотом, додає countdown bar, фільтровану History-панель і першу Settings-сторінку. Треба зафіксувати, які окремо запускані частини системи (target surfaces) вона створює або змінює — це визначає §5-контейнери, шари задач і рівні тестів усіх наступних етапів.

## Decision drivers

- Зміни поведінки збереження, countdown bar, loader, History-панель, Settings-сторінка — все живе в браузерному SPA (spec US-01…US-07).
- Нові settings-ендпоінти, маркер/фільтр історії, міграції БД — бекенд (spec AC-08…AC-11c, §6.1 authz).
- Layout screenshot знімається лише в живому DOM браузера (`html-to-image`) — фонові воркери не мають джерела зображення.

## Considered options

1. **`[web-frontend, backend-service]`** — браузерна частина в існуючому SPA web-editor + серверна в існуючому Express api.
2. **`[web-frontend, backend-service, worker]`** — додатково серверна генерація прев'ю у BullMQ-воркері (headless-рендер канваса).

## Decision outcome

**Chosen:** Option 1 — `[web-frontend, backend-service]`. Воркер відхилено: специфікація вимагає скриншот живого канваса в момент checkpoint-а (з full-screen loader-ом у браузері); серверний headless-рендер канваса довелося б будувати з нуля заради того, що браузер уже вміє.

## Consequences

**Positive**
- Мінімальна поверхня змін: два існуючі контейнери, нуль нових деплой-юнітів.
- Downstream-етапи (api / sequences / tasks / plan-tests) читають `target_surfaces` із frontmatter sad.md і вмикають ui-шар задач + фронтові рівні тестів (component / e2e-through-UI) поряд із бекендовими.

**Negative**
- Уся логіка розкладу checkpoint-ів залежить від життєздатності вкладки браузера (див. ADR-0002 — visibility-обробка обов'язкова).

**Neutral**
- Якщо колись знадобиться серверна генерація прев'ю (наприклад, для шерінгу), worker-поверхня додається окремим ADR без зламу цього рішення.

## Links

- Spec: [[../spec.md]] §4 (US-01…US-07)
- SAD: [[../sad.md]] §4
- Related ADR: [[0002-client-owned-checkpoint-scheduler]]
