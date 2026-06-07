---
id: T20
title: "Render the star-gate message with exit actions and add the concurrency-limit setting UI"
layer: "ui"
deps: ["T6", "T10"]
acs: ["AC-03", "AC-08"]
files_hint:
  - "apps/web-editor/src/features/storyboard/components/"
  - "apps/web-editor/src/features/settings/"
owner: "Oleksii"
estimate: "S"
status: "todo"
---

# T20 — UI: gate message + concurrency setting

## Why

Гейт без зрозумілого виходу = drop-off у воронці — ризик №1 (sad §11, KPI-2 spec §7). Setting — Creator-конфігуроване N вікна (AC-03).

## What

**Reuse:** існуючий error/notice-патерн сторіборда; settings-форма фічі settings (прецедент autosave-інтервалу).

- Відмова гейта при старті scene previews → повідомлення, що **називає точно ці блоки** plain-language + дії-виходи: retry генерації / видалити блок (AC-08, AC-04) — дії ведуть до відповідних операцій T15.
- Settings: поле «ліміт одночасних reference-генерацій» (default 4) → `updateMySettings` (`concurrencyLimit`).

## Definition of Done

- [ ] Компонентні тести: gate-повідомлення перелічує блоки з відповіді API та рендерить обидві дії-виходи
- [ ] Тест: setting читається/зберігається; default 4 за відсутності значення
- [ ] lint + typecheck не гірші за baseline

## Notes

Текст повідомлення — з контрактної відповіді гейта (T10), UI не дублює логіку перевірки.
