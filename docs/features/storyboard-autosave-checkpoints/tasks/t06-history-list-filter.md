---
id: T6
title: "History list: filter to origin=checkpoint and expose previewKind"
layer: "ports"
deps: ["T2"]
acs: ["AC-08", "AC-13"]
files_hint:
  - "apps/api/src/services/storyboard.service.ts"
  - "apps/api/src/repositories/storyboard.repository.ts"
  - "apps/api/src/controllers/storyboard.controller.ts"
owner: "Oleksii (solo dev)"
estimate: "S"
status: "todo"
---

# T6 — History list: filter to origin=checkpoint and expose previewKind

## Why

AC-08: панель показує лише checkpoint-и; легасі приховані SQL-фільтром, не видалені ([ADR-0003](../adr/0003-history-origin-column.md), [sad §6 «Відкриття History-панелі»](../sad.md), [openapi.yaml](../contracts/openapi.yaml) §GET history).

## What

`findHistoryByDraftId` (`storyboard.repository.ts`): `WHERE draft_id = ? AND origin = 'checkpoint' ORDER BY id DESC LIMIT 50` — обслуговується новим індексом `idx_storyboard_history_draft_origin` (T2). У відповідь кожного entry додати `previewKind` (camelCase на дроті); `origin` свідомо НЕ виводити (константа після фільтра — контрактна нотатка). Ownership-перевірка не-власник → 403 — існуюча, без змін (AC-13 restated).

## Definition of Done

- [ ] Інтеграційний тест із мішаними origin (фікстура `insertHistoryEntry` обох походжень): GET повертає лише checkpoint-и, новіші зверху, ≤ 50, кожен із `previewKind`; легасі-рядки лишаються в таблиці
- [ ] Відповідь відповідає контракту `HistoryEntry` (required: id, draftId, snapshot, previewKind, createdAt)
- [ ] Не-власник → 403 (регресійний тест існуючого правила)
- [ ] lint + typecheck не гірші за базлайн

## Notes

Ділить файли з T5 → одна lane. NFR: panel load ≤ 500 мс p95 — індекс читає без сортування (перевірено `EXPLAIN` у T2).
