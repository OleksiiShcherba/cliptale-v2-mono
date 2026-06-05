---
id: T2
title: "Promote the staged storyboard_history origin/preview_kind migration"
layer: "migration"
deps: []
acs: ["AC-08", "AC-04"]
files_hint:
  - "docs/features/storyboard-autosave-checkpoints/migrations/02_add_history_origin_preview.up.sql"
  - "docs/features/storyboard-autosave-checkpoints/migrations/02_add_history_origin_preview.down.sql"
owner: "Oleksii (solo dev)"
estimate: "S"
status: "todo"
---

# T2 — Promote the staged storyboard_history origin/preview_kind migration

## Why

Маркер походження History entry ([ADR-0003](../adr/0003-history-origin-column.md)) — основа SQL-фільтра легасі (AC-08) і серверного підрахунку minimap-фолбеків (NFR < 2 %, AC-04). Форма колонок та індекс — [data-model.md](../data-model.md) §`storyboard_history`.

## What

`implement` промотує staged-пару `02_add_history_origin_preview.{up,down}.sql` у живе `apps/api/src/db/migrations/` (очікувано `051_history_origin.sql`): `origin ENUM('legacy','checkpoint') NOT NULL DEFAULT 'legacy'`, `preview_kind ENUM('screenshot','minimap') NULL DEFAULT NULL`, індекс `idx_storyboard_history_draft_origin (draft_id, origin, id DESC)`. Жодна існуюча колонка не змінюється.

## Definition of Done

- [ ] Up застосовується чисто (INSTANT ALTER — DEFAULT «бекфілить» існуючі рядки в `legacy` без перепису таблиці); down прибирає обидві колонки та індекс
- [ ] Після up існуючі рядки читаються з `origin='legacy'`, `preview_kind IS NULL` (інтеграційна перевірка)
- [ ] `EXPLAIN` запиту панелі (`WHERE draft_id=? AND origin='checkpoint' ORDER BY id DESC LIMIT 50`) показує використання нового індексу без filesort
- [ ] lint + typecheck не гірші за базлайн

## Notes

Серіалізується після T1 (ordered migration sequence). ENUM, не VARCHAR — рішення власника 2026-06-05 (data-model header).
