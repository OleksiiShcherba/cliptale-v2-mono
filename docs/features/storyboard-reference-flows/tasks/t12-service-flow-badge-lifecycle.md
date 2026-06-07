---
id: T12
title: "Derive the draft badge, delete-flow warning + no-flow state, draft-deletion survival, duplication unlink + checkpoint re-validation"
layer: "app"
deps: ["T2"]
acs: ["AC-12", "AC-14b"]
files_hint:
  - "apps/api/src/services/generation-flow.service.ts"
  - "apps/api/src/controllers/generation-flow.controller.ts"
  - "apps/api/src/services/generationDraft.restore.service.ts"
  - "apps/api/src/services/generationDraft.service.ts"
owner: "Oleksii"
estimate: "M"
status: "todo"
---

# T12 — Badge, delete-warning, лайфцикл-семантики

## Why

[ADR-0010](../adr/0010-derive-draft-badge-from-block-flow-link.md) (badge — derived з лінка, не колонка) + [ADR-0006](../adr/0006-unlink-on-duplicate-revalidate-on-restore.md) (unlink при дублюванні, re-validate при відновленні). [sad §6 Flows 9, 10](../sad.md).

## What

Мінімальні точки дотику в чужих сервісах (sad §5 D5.1):

- `listGenerationFlows`: badge драфта через JOIN на `uq_…_flow` (який блок лінкує флоу) — за [openapi.yaml](../contracts/openapi.yaml).
- `deleteGenerationFlow`: лінкований блок існує → контрактна відповідь-попередження; після підтвердження — делішн, блок у **no-flow state** (`flow_id=NULL` через FK SET NULL): без превʼю, без кандидатів, фейлить гейт.
- Драфт-делішн: блоки каскадом, **флоу і результати виживають**, badge зникає сам (AC-14b).
- Дублювання драфта: скопійовані блоки без `flow_id` (no-flow state, без шерінгу флоу).
- Checkpoint restore: ре-валідація block↔flow лінків, відсутні флоу → no-flow.

## Definition of Done

- [ ] Тест: список флоу показує badge лише для лінкованих; делішн лінкованого флоу без confirm-прапорця → попередження
- [ ] Тест: після делішну флоу блок у no-flow state і фейлить гейт
- [ ] Інтеграційний тест AC-14b: делішн драфта → флоу в списку без badge
- [ ] Тест: дублювання → копії блоків у no-flow; restore маркує відсутні флоу як no-flow
- [ ] lint + typecheck не гірші за baseline

## Notes

Не додавати колонок на `generation_flows` — badge строго derived (ADR-0010).
