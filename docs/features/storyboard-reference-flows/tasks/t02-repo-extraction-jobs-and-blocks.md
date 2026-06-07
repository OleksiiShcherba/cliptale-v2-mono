---
id: T2
title: "Implement extraction-job + reference-block repositories (atomic window claim, CAS version)"
layer: "infra"
deps: ["T1"]
acs: ["AC-01", "AC-03", "AC-04"]
files_hint:
  - "apps/api/src/repositories/storyboardReference.repository.ts"
  - "apps/api/src/repositories/storyboardReference.repository.test.ts"
owner: "Oleksii"
estimate: "M"
status: "todo"
---

# T2 — Extraction-job + reference-block repositories

## Why

Шар доступу до `storyboard_cast_extraction_jobs` і `storyboard_reference_blocks` — джерело правди rolling window ([ADR-0003](../adr/0003-db-state-rolling-window-with-worker-completion-hook.md), [data-model.md](../data-model.md) §Reference Block).

## What

Новий `storyboardReference.repository.ts` (конвенція репо: чистий SQL через `mysql2`, owner-фільтр на кожен запит):

- CRUD job-рядків екстракції + «останній job драфта» (`idx_…_draft_created`).
- CRUD блоків у cast-порядку (`idx_…_draft_sort`); upsert XY-позиції.
- **Атомарний claim** наступного `pending` блока драфта (`UPDATE … WHERE draft_id=? AND window_status='pending' ORDER BY sort_order LIMIT 1`) — ідемпотентний.
- **CAS-інкремент `version`** блока (повертає affected rows для 409-логіки сервісу).

## Definition of Done

- [ ] Інтеграційні тести на реальній MySQL (без моків): CRUD, останній job, cast-порядок
- [ ] Тест атомарного claim: два конкурентні claim одного драфта → рівно один переможець
- [ ] Тест CAS: stale version → 0 affected rows; актуальна → інкремент
- [ ] lint + typecheck не гірші за baseline

## Notes

Паралельна гілка з T3. Vitest запускати з відповідного app-каталогу (repo gate realities).
