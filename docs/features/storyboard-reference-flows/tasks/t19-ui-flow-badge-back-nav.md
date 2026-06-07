---
id: T19
title: "Show the draft badge in the flow list, the delete-flow dependency warning, and the back-to-storyboard action"
layer: "ui"
deps: ["T12"]
acs: ["AC-05", "AC-12"]
files_hint:
  - "apps/web-editor/src/features/generate-ai-flow/components/FlowListPage.tsx"
  - "apps/web-editor/src/features/generate-ai-flow/components/FlowEditorPage.tsx"
owner: "Oleksii"
estimate: "M"
status: "todo"
---

# T19 — UI: draft badge, delete warning, back-to-storyboard

## Why

Reference-флоу видимі й безпечні у списку Generate AI ([sad §6 Flows 3, 10](../sad.md), [ADR-0010](../adr/0010-derive-draft-badge-from-block-flow-link.md)).

## What

**Reuse:** `FlowListPage.tsx` (розширення картки), `FlowEditorPage.tsx` (хедер), shared confirm-діалог.

- Badge драфта на картках reference-флоу (поле з `listGenerationFlows`).
- Делішн такого флоу → попередження «storyboard-блок залежить від цього флоу» → делішн лише після підтвердження (AC-12); блок переходить у no-flow (відобразиться через T15).
- Флоу, відкритий із блока, показує «back to storyboard» → повернення до того ж драфта (AC-05); навігаційний контекст передається при відкритті з блока.

## Definition of Done

- [ ] Компонентні тести: badge лише в лінкованих флоу; warning-діалог блокує делішн до підтвердження
- [ ] Тест: back-дія видима лише при відкритті з блока і веде до правильного драфта
- [ ] lint + typecheck не гірші за baseline

## Notes

Паралельно з рештою UI. Делішн-warning спирається на контрактну відповідь T12, не на окремий запит.
