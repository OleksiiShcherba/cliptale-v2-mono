---
id: T4
title: "Build cast-extraction service: start (owner-scoped, AC-01b guard) + get proposal"
layer: "app"
deps: ["T2"]
acs: ["AC-01", "AC-01b", "AC-13"]
files_hint:
  - "apps/api/src/services/storyboardReference.extraction.service.ts"
  - "apps/api/src/services/storyboardReference.extraction.service.test.ts"
owner: "Oleksii"
estimate: "M"
status: "todo"
---

# T4 — Cast-extraction service (start / get)

## Why

API-бік [sad §6 Flow 1](../sad.md): старт екстракції створює job-рядок і ставить джобу на чергу `storyboard-plan` ([ADR-0002](../adr/0002-cast-extraction-on-storyboard-plan-queue.md)); нічого не списується (екстракція безплатна).

## What

`storyboardReference.extraction.service.ts`:

- `startExtraction(userId, draftId)`: owner-перевірка (відмова без розкриття існування, AC-13) → **guard AC-01b**: якщо у драфта вже є reference-блоки — типізована помилка → job-рядок `queued` → enqueue `cast-extract` (payload з [events.md](../contracts/events.md)).
- `getExtraction(userId, draftId)`: останній job з `proposal_json` + `aggregate_estimate_credits` (reattach-fallback realtime).

## Definition of Done

- [ ] Тест: start створює рядок і ставить джобу; повторний start при існуючих блоках → помилка контрактного типу
- [ ] Тест: не-власник на start/get → відмова в стилі not-found
- [ ] Тест: get повертає proposal після completed і error_message після failed
- [ ] lint + typecheck не гірші за baseline

## Notes

Прецедент: `generationDraft.storyboardPlan.service.ts` (та сама черга й телеметрія).
