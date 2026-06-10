---
id: T1
title: "Add readiness reads (Q1–Q3) to the reference repositories"
layer: "infra"
deps: []
acs: ["AC-01", "AC-02", "AC-03", "AC-03b", "AC-04b", "AC-07"]
files_hint:
  - "apps/api/src/repositories/storyboardReference.repository.ts"
  - "apps/api/src/repositories/storyboardReference.repository.test.ts"
  - "apps/api/src/repositories/storyboardReferenceCuration.repository.ts"
owner: "Oleksii"
estimate: "M"
status: "todo"
---

# T1 — Readiness reads (Q1–Q3) у reference-репозиторіях

## Why

Гейт читає готовність як **існування persisted output**, а не `window_status` чи зірки — [ADR-0002](../adr/0002-gate-on-persisted-reference-output-existence.md), readiness-предикат і SQL-форми Q1–Q3 з індексами — [data-model.md §Queries → indexes](../data-model.md).

## What

Нові read-методи в наявних reference-репозиторіях (raw SQL, без нових індексів):

- **Q1** full-set readiness: усі блоки драфта + `EXISTS` по `flow_files` (`deleted_at IS NULL`); блок з `flow_id IS NULL` — not-ready.
- **Q2** scene-scoped readiness: блоки, лінковані до сцени S, з тим самим `EXISTS`.
- **Q3** reference-less сцени: anti-join `storyboard_blocks` (`block_type='scene'`) × `storyboard_reference_scene_links`.

Повертати `{ id, name, ready }` (ім'я потрібне для named rejection). Точні SQL-форми — у data-model, не переписувати по-своєму.

## Definition of Done

- [ ] Інтеграційні тести (live MySQL, co-located, стиль `seedDraft`) покривають стани: rolling-window done-з-output → ready; running-без-output → not-ready; manual-з-flow-output → ready; manual без flow (`flow_id NULL`) → not-ready; output із `deleted_at` → не рахується.
- [ ] Q3 повертає лише `scene`-блоки без жодного лінка.
- [ ] Жодного нового індексу чи зміни схеми; lint + typecheck чисті (з поправкою на pre-existing failures).

## Notes

Сидери за [data-model §Test fixtures](../data-model.md): `seedDraftWithCast`, `seedFlowOutput`, `seedSceneLink`. Прецедент — `storyboardReference.repository.test.ts`.
