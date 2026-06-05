---
id: T1
title: "Promote the staged user_settings migration into the live migrations tree"
layer: "migration"
deps: []
acs: ["AC-09", "AC-10"]
files_hint:
  - "docs/features/storyboard-autosave-checkpoints/migrations/01_create_user_settings.up.sql"
  - "docs/features/storyboard-autosave-checkpoints/migrations/01_create_user_settings.down.sql"
owner: "Oleksii (solo dev)"
estimate: "S"
status: "todo"
---

# T1 — Promote the staged user_settings migration into the live migrations tree

## Why

Сховище першої per-account преференції (autosave interval) — [data-model.md](../data-model.md) §`user_settings`, [ADR-0004](../adr/0004-user-settings-json-table.md). Без таблиці немає AC-09/AC-10 (інтервал слідує за акаунтом).

## What

`implement` промотує staged-пару `01_create_user_settings.{up,down}.sql` у живе `apps/api/src/db/migrations/` під наступним вільним номером (очікувано `050_user_settings.sql` — конвенція: один up-файл, нумерований `NNN_*`; down-логіка — за патерном репо). Форма таблиці — точно за data-model: `user_id CHAR(36) PK FK→users ON DELETE CASCADE`, `settings_json JSON NOT NULL`, `updated_at DATETIME(3) ... ON UPDATE` (прецедент 028).

## Definition of Done

- [ ] Staged up/down промотовано в живе `migrations/` без зміни семантики (лише номер/ім'я за конвенцією)
- [ ] Up застосовується чисто на живому MySQL через in-process runner (`APP_MIGRATE_ON_BOOT`); down відкочує без залишків
- [ ] FK CASCADE підтверджено інтеграційним тестом або ручним `DELETE FROM users` на тестовому записі
- [ ] lint + typecheck не гірші за базлайн (pre-existing-broken — див. repo gate realities)

## Notes

`layer: migration` — серіалізується `implement`-ом (ordered sequence: T1 перед T2). Жодних seeds (data-model §Seeds: рядок створюється ліниво).
