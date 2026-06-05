---
id: T5
title: "Checkpoint push: POST history stamps origin=checkpoint and stores previewKind"
layer: "ports"
deps: ["T2"]
acs: ["AC-03", "AC-04", "AC-07", "AC-12"]
files_hint:
  - "apps/api/src/controllers/storyboard.controller.schemas.ts"
  - "apps/api/src/controllers/storyboard.controller.ts"
  - "apps/api/src/services/storyboard.service.ts"
  - "apps/api/src/repositories/storyboard.repository.ts"
  - "apps/api/src/repositories/storyboardHistory.repository.ts"
  - "apps/api/src/services/storyboardPlanApply.service.ts"
  - "packages/api-contracts/src/openapi.ts"
owner: "Oleksii (solo dev)"
estimate: "M"
status: "todo"
---

# T5 — Checkpoint push: POST history stamps origin=checkpoint and stores previewKind

## Why

Серверна половина checkpoint save — [openapi.yaml](../contracts/openapi.yaml) §`POST /storyboards/{draftId}/history` (`CheckpointPush`), [ADR-0003](../adr/0003-history-origin-column.md)/[ADR-0005](../adr/0005-inline-data-url-screenshot.md), потік [sad §6 Critical flow 1](../sad.md).

## What

- Розширити Zod-схему push-body (`storyboard.controller.schemas.ts`): обовʼязковий `previewKind: 'screenshot' | 'minimap'` поруч зі `snapshot` (скриншот їде інлайн усередині snapshot — серверу opaque).
- `storyboard.service.pushHistory` → `insertHistoryAndPrune` (`storyboard.repository.ts`): INSERT пише `origin='checkpoint'` (серверний штамп — не поле запиту; клієнт не може записати `legacy`) + `preview_kind`; prune лишається origin-агностичним (data-model §Constraints), успадковує існуючий mysql2 text-protocol LIMIT-обхід — не «виправляти».
- `insertHistoryAndPruneInTx` (`storyboardHistory.repository.ts`, викликається з `storyboardPlanApply.service.ts`): теж явно проставити origin — **дефолт задачі: `'checkpoint'` + `preview_kind='minimap'`**, інакше server-side pre-plan-apply safety-записи стануть невидимими в панелі (див. ризик у [_epic.md](./_epic.md)). Підтвердити рішення при імплементації.
- Відповідь `201 { id }` (`CheckpointCreated`). Оновити `packages/api-contracts/src/openapi.ts` тим самим комітом.

## Definition of Done

- [ ] Інтеграційні тести: push зі `previewKind:'screenshot'` → рядок `origin='checkpoint'`/`preview_kind='screenshot'`; з `'minimap'` → відповідно; без `previewKind` → 400; не-власник → 403 (AC-13-правило на існуючому шляху)
- [ ] Prune з мішаними origin: кап 50 діє на всі рядки draft-а разом (легасі «старіють» — spec Non-goal)
- [ ] Plan-apply вставка пише явний origin (тест на `insertHistoryAndPruneInTx`)
- [ ] `packages/api-contracts/src/openapi.ts` оновлено в тому ж коміті; lint + typecheck не гірші за базлайн

## Notes

Ділить файли з T6 → одна lane (серіалізовано `implement`-ом). Сервер свідомо без concurrency-lock — single-flight гарантує клієнт (AC-07b, ADR-0002).
