---
id: T5
title: "Build worker cast-extract job: LLM proposal constrained by Zod cast schema, limit 12, scene-relevance ranking"
layer: "app"
deps: ["T2"]
acs: ["AC-01", "AC-02"]
files_hint:
  - "apps/media-worker/src/jobs/cast-extract.job.ts"
  - "apps/media-worker/src/jobs/cast-extract.job.test.ts"
owner: "Oleksii"
estimate: "M"
status: "todo"
---

# T5 — Worker cast-extract job

## Why

Worker-бік [sad §6 Flow 1](../sad.md) ([ADR-0002](../adr/0002-cast-extraction-on-storyboard-plan-queue.md)): LLM пропонує каст зі скрипта; **скрипт = data, не інструкції** — вихід обмежений Zod-схемою касту (spec §6.1).

## What

Новий handler `cast-extract.job.ts` на існуючій черзі `storyboard-plan` (прецедент `storyboardPlan.job.ts`):

- LLM-виклик: персонажі/оточення з описами, призначення вже завантажених зображень, пропозиція scene links; вихід валідований Zod.
- **Cast size limit 12**: ранжування за scene-appearance count, відсікання решти + позначка для повідомлення «решту можна додати вручну» (AC-02).
- Агрегатна оцінка: сума пер-флоу оцінок через існуючий `flow-pricing` → `aggregate_estimate_credits`.
- Збереження `proposal_json`, статуси `running → completed/failed` (failed — plain-language `error_message`), realtime-події `storyboard.cast_extraction.updated` ([events.md](../contracts/events.md)).

## Definition of Done

- [ ] Тест: вихід поза Zod-схемою → джоба failed, не зберігається сире
- [ ] Тест: >12 кандидатів → рівно 12 за найбільшим scene-appearance count + overflow-позначка
- [ ] Тест: redelivery перезаписує proposal без побічних ефектів (екстракція безплатна, at-least-once ок)
- [ ] Тест: realtime-події публікуються зі схемою з events.md
- [ ] lint + typecheck не гірші за baseline

## Notes

NFR p95 ≤ 60 s — телеметрія каналу `storyboard-plan` (`cast_extract_duration_p95`, sad §7). Промпт ітерується без міграцій (sad §11).
