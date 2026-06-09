---
id: T8
title: "Drop the principal-image read from the scene job inputs"
layer: "infra"
deps: ["T7"]
acs: ["AC-04", "AC-05", "AC-08"]
files_hint:
  - "apps/media-worker/src/jobs/storyboardOpenAIImage.job.ts"
  - "apps/media-worker/src/jobs/storyboardOpenAIImage.job.test.ts"
owner: "Oleksii"
estimate: "S"
status: "todo"
---

# T8 — Прибрати principal-read зі scene-джоби

## Why

Scene-джоба більше не читає principal image — [ADR-0004](../adr/0004-retire-principal-image-by-ignoring-it-on-read.md), [sad §5 (`resolveSceneInputs`)](../sad.md), worker-бік контракту — [contracts/events.md](../contracts/events.md).

## What

У `apps/media-worker/src/jobs/storyboardOpenAIImage.job.ts`:

- `resolveSceneInputs`: прибрати principal `referenceOutputFileId` з inputs сцени; референси сцени — тільки selected outputs її лінкованих блоків (T7).
- Zero-reference драфт: сцена генерується з промпта + derived style description (AC-04), без жодного референс-файлу.
- Idempotency/retry/dead-letter політики джоби — без змін (sad §8).

## Definition of Done

- [ ] Unit-тести джоби: inputs сцени не містять principal-файла навіть за наявності legacy-рядка; zero-ref сцена йде prompt+style-шляхом; referenced сцена отримує рівно один output на лінкований блок.
- [ ] Жодного читання `storyboard_illustration_references` у worker (grep чистий).
- [ ] lint + typecheck чисті.

## Notes

Lane спільна з T7/T12. Кошти не чіпати: зміна стосується лише складу inputs, не механізму генерації (spec §3 non-goal).
