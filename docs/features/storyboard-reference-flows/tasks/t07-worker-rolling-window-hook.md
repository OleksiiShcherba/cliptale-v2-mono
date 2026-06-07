---
id: T7
title: "Add rolling-window completion-hook to the ai-generate worker job"
layer: "app"
deps: ["T2"]
acs: ["AC-03", "AC-04"]
files_hint:
  - "apps/media-worker/src/jobs/ai-generate.job.ts"
  - "apps/media-worker/src/jobs/ai-generate.referenceWindow.ts"
  - "apps/media-worker/src/jobs/ai-generate.referenceWindow.test.ts"
owner: "Oleksii"
estimate: "M"
status: "todo"
---

# T7 — Rolling-window completion-hook

## Why

[ADR-0003](../adr/0003-db-state-rolling-window-with-worker-completion-hook.md): БД — джерело правди вікна; воркер по завершенні першої генерації атомарно claim-ить наступний pending того ж драфта. [sad §6 Flow 1](../sad.md) loop.

## What

Хук у `ai-generate.job.ts` (логіка — в окремому `ai-generate.referenceWindow.ts`, мінімальна точка дотику):

- Якщо job — перший запуск reference-блока (`first_job_id`): success → `window_status='done'`; failure → `'failed'` + plain-language `error_message` (інші блоки не зачеплені, AC-04).
- Атомарний claim наступного pending (T2) → enqueue наступної генерації → realtime `storyboard.reference_block.updated` ([events.md](../contracts/events.md)).
- Ідемпотентність: redelivery не списує вдруге (існуючий worker-side guard) і не claim-ить двічі.

## Definition of Done

- [ ] Тест: done/failed виставляються коректно; failed містить зрозумілу причину
- [ ] Тест: завершення → claim + enqueue рівно одного наступного pending; немає pending → нічого
- [ ] Тест: повторна доставка завершеної джоби → no-op (без подвійного claim/charge)
- [ ] Тест: failure одного блока не зупиняє вікно інших
- [ ] lint + typecheck не гірші за baseline

## Notes

Ризик «зависле вікно» (sad §11): алерт «pending > 5 хв без running» — метрика sad §7; retry на блоці (T8) перезапускає диспетч.
