---
id: T3
title: "Implement stars + scene-links repositories (idempotent toggle, primary uniqueness, cascade)"
layer: "infra"
deps: ["T1"]
acs: ["AC-06", "AC-07", "AC-10", "AC-10b"]
files_hint:
  - "apps/api/src/repositories/storyboardReferenceCuration.repository.ts"
  - "apps/api/src/repositories/storyboardReferenceCuration.repository.test.ts"
owner: "Oleksii"
estimate: "M"
status: "todo"
---

# T3 — Stars + scene-links repositories

## Why

Доступ до `storyboard_reference_stars` і `storyboard_reference_scene_links` ([ADR-0009](../adr/0009-stars-as-rows-referencing-flow-result-files.md), [data-model.md](../data-model.md)). Зірки — комутативні toggle без версій (Override sad §1 ¶4).

## What

Новий `storyboardReferenceCuration.repository.ts` (патерн кількох repo-файлів на домен, як `storyboardMusic*`):

- Star toggle: `INSERT … ON DUPLICATE KEY` / `DELETE` по `(reference_block_id, file_id)` — ідемпотентно, без version.
- Призначення/зняття primary під UNIQUE `(reference_block_id, is_primary)`; вибірка fallback-кандидата (найраніша зірка).
- Зірки блока / блоки за file_id (`idx_…_file` — для sync-чистки).
- Replace-set списку scene links блока (в одній транзакції з CAS-інкрементом T2); блоки, лінковані до сцени X (`idx_…_scene`).

## Definition of Done

- [ ] Інтеграційні тести: повторний star того самого file — no-op; un-star неіснуючої — no-op
- [ ] Тест: другий primary на блок неможливий; зняття primary звільняє слот
- [ ] Тест каскаду: видалення scene-блока прибирає лінки (no dangling, AC-10b); видалення file прибирає зірки
- [ ] lint + typecheck не гірші за baseline

## Notes

Паралельна гілка з T2. Тест-фікстури — хелпери з [data-model.md §Test fixtures](../data-model.md) (`createReferenceStar`, `createReferenceSceneLink`), PII guard: тільки `'Test Character'`-імена.
