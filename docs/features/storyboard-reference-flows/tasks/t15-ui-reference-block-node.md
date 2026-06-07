---
id: T15
title: "Build the ReferenceBlockNode on the Video Road Map canvas: preview, window statuses + retry, no-flow state, open-flow navigation, manual add"
layer: "ui"
deps: ["T14"]
acs: ["AC-03", "AC-04", "AC-05", "AC-07", "AC-11"]
files_hint:
  - "apps/web-editor/src/features/storyboard/components/ReferenceBlockNode.tsx"
  - "apps/web-editor/src/features/storyboard/components/ReferenceBlockNode.styles.ts"
  - "apps/web-editor/src/features/storyboard/components/ReferenceBlockNode.test.tsx"
  - "apps/web-editor/src/features/storyboard/api.ts"
owner: "Oleksii"
estimate: "L"
status: "todo"
---

# T15 — UI: ReferenceBlockNode на Video Road Map

## Why

Візуальний носій касту на канвасі ([sad §6 Flows 1, 3, 4, 8](../sad.md)). Прецедент розміщення — music blocks (off-chain).

## What

**Reuse:** `MusicBlockNode.tsx` (off-chain розміщення, патерн ноди), `nodeStyles.ts`, `SceneBlockNode.mediaThumbnail.tsx` (превʼю), існуючий realtime-хук сторіборда; інлайн `*.styles.ts`. **Новий компонент:** `ReferenceBlockNode` — жоден існуючий примітив не поєднує превʼю + статус вікна + лінк на флоу.

- Превʼю = primary star; без зірок — no-preview placeholder (AC-07).
- Статуси `pending / running / done / failed` (failed: причина + кнопка retry, AC-04) через `storyboard.reference_block.updated` ([events.md](../contracts/events.md)).
- **No-flow state** — візуально відмінний (після делішну флоу / дублювання).
- Клік → лінкований флоу **в тій же вкладці** (AC-05); XY-позиція персиститься через `updateReferenceBlock`.
- Дія «додати reference-блок» (character/environment) на канвасі → `createReferenceBlock` (AC-11).
- `api.ts`: клієнтські методи list/create/update/delete/retry.

## Definition of Done

- [ ] Компонентні тести: превʼю/placeholder, кожен статус, no-flow, retry-клік, навігація у флоу
- [ ] Realtime-подія оновлює ноду без перезавантаження
- [ ] Канвас із 50 блоками відкривається ≤ 1500 ms (NFR; метрика `storyboard_canvas_open_ms`)
- [ ] lint + typecheck не гірші за baseline

## Notes

Паралельна гілка з T16/T18. Linked-scenes список і селектор — T16 (не дублювати).
