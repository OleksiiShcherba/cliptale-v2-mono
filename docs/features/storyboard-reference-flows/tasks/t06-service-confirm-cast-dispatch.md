---
id: T6
title: "Build confirm-cast service: blocks + flows + pending window rows, aggregate estimate, dispatch first N (user concurrencyLimit)"
layer: "app"
deps: ["T2", "T3"]
acs: ["AC-03", "AC-13"]
files_hint:
  - "apps/api/src/services/storyboardReference.confirm.service.ts"
  - "apps/api/src/services/storyboardReference.confirm.service.test.ts"
  - "apps/api/src/services/settings.service.ts"
owner: "Oleksii"
estimate: "L"
status: "todo"
---

# T6 — Confirm-cast service + rolling-window dispatch

## Why

Серце фічі: [sad §6 Flow 1](../sad.md) після підтвердження, [ADR-0003](../adr/0003-db-state-rolling-window-with-worker-completion-hook.md) (вікно зі стану БД) + [ADR-0004](../adr/0004-per-run-charging-under-collective-confirmation.md) (списання пер-ран при старті, не при confirm).

## What

`storyboardReference.confirm.service.ts`:

- Прийом відкоригованого касту (записи, описи, зображення, scene links) — owner-scoped.
- Транзакційно: по одному блоку на запис (cast-порядок → `sort_order`) + 1:1 авто-створений reference flow, пре-філл зображеннями або текстовим описом + збереження proposed scene links + усі перші запуски `window_status='pending'`.
- Enqueue перших `min(N, cast)` генерацій на `ai-generate`; N — `concurrencyLimit` з `user_settings.settings_json` (default 4; розширити `settings.service.ts` + Zod-схему `updateMySettings`, прецедент autosave-інтервалу, migration 050).
- **Жодного списання при confirm** — оплата пер-ран у воркері при старті.

## Definition of Done

- [ ] Інтеграційний тест: confirm з кастом K створює K блоків + K флоу + K pending і рівно min(N, K) джоб у черзі
- [ ] Тест: помилка всередині транзакції → жодного блока/флоу/pending (атомарність)
- [ ] Тест: N читається з user_settings; відсутнє значення → default 4; setting зберігається через updateMySettings
- [ ] Тест: біллінг не викликається на confirm
- [ ] Тест: не-власник → відмова без розкриття
- [ ] lint + typecheck не гірші за baseline

## Notes

NFR: повний каст generating ≤ 5 хв після confirm (метрика `reference_window_pickup_lag`, sad §7). Естімейт у відповіді = `aggregate_estimate_credits` job-рядка (±10% NFR).
