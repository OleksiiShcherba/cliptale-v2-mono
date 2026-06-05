---
id: T16
title: "KPI-1 baseline: document + run the one-week history write-rate count"
layer: "docs"
deps: []
acs: []
files_hint:
  - "docs/features/storyboard-autosave-checkpoints/_audit/kpi1-baseline.md"
owner: "Oleksii (solo dev)"
estimate: "S"
status: "todo"
---

# T16 — KPI-1 baseline: document + run the one-week history write-rate count

## Why

KPI-1 (spec §7): «History snapshot writes per active editing hour per draft … baseline: TBD, measured by counting history-table row creation over one week before release; target ≥ 90 % reduction». Spec §8 OQ-3 (default: dev знімає тижневий підрахунок до release-гілки) — due before `sdd:implement` завершиться релізом; [sad §11](../sad.md) тримає це як Open question.

## What

- Написати й задокументувати SQL по `storyboard_history` (rows/draft/година за `created_at`; «active editing hour» = клок-година з ≥ 1 зміною — апроксимується годинами з ≥ 1 history-рядком до фічі, бо сьогодні кожна зміна пише history).
- Зняти тижневий базлайн на проді ДО release-гілки; зафіксувати число + методику в `_audit/kpi1-baseline.md`.
- Додати туди ж post-release запит порівняння (той самий SQL + частка `preview_kind='minimap'` для KPI-2).

## Definition of Done

- [ ] `_audit/kpi1-baseline.md` містить: SQL, період виміру, число базлайну, ім'я того, хто зняв, дату
- [ ] Закрито spec §8 OQ-3 (відмітка в spec.md) і рядок «Open question» у sad §11
- [ ] Post-release запит порівняння готовий до запуску

## Notes

Без deps і без коду — але **календарно блокує реліз** (тиждень виміру має пройти до release-гілки): стартувати першим. Read-only SQL на проді.
