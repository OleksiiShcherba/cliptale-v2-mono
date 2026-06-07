---
id: T9
title: "Build star service: versionless atomic toggle, primary designation, preview fallback, cleanup sync on result/file deletion"
layer: "app"
deps: ["T2", "T3"]
acs: ["AC-06", "AC-07", "AC-13"]
files_hint:
  - "apps/api/src/services/generation-flow.stars.service.ts"
  - "apps/api/src/services/generation-flow.stars.service.test.ts"
owner: "Oleksii"
estimate: "M"
status: "todo"
---

# T9 — Star service

## Why

[ADR-0009](../adr/0009-stars-as-rows-referencing-flow-result-files.md): зірки — рядки курації, що посилаються на result-файли флоу; безверсійні комутативні toggle (Override sad §1 ¶4). [sad §6 Flows 2, 4](../sad.md).

## What

Новий `generation-flow.stars.service.ts` (окремий файл — без перетину з T12 у `generation-flow.service.ts`):

- `star(userId, blockId, fileId, {primary?})` / `unstar(…)`: ідемпотентні toggle поверх T3; file мусить належати result-у лінкованого флоу.
- Призначення primary (превʼю блока); зняття primary → fallback на іншу зірку (найраніша), інакше no-preview placeholder + блок рахується без зірки для гейта (AC-07).
- **Sync-чистка**: видалення result-блока/файлу у флоу синхронно прибирає його зірки (точка дотику в існуючому делішн-шляху флоу; ризик «розсинхрон зірок», sad §11).

## Definition of Done

- [ ] Тест: star/unstar ідемпотентні; конкурентні toggle сходяться до детермінованого стану
- [ ] Тест: primary → превʼю; зняття primary → fallback або placeholder; видалення останньої зірки → блок без зірки для гейта
- [ ] Інтеграційний тест AC-07: видалення result/file → зірки зникли, превʼю перерахувалося
- [ ] Тест: зірка на file чужого/нелінкованого флоу → відмова; не-власник → відмова без розкриття
- [ ] lint + typecheck не гірші за baseline

## Notes

Прийнятий борг (sad §11): конкурентна маніпуляція primary з двох вкладок може дати неочікуваний стан — НЕ додавати версіонування.
