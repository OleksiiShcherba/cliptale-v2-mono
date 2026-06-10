---
id: T5
title: "Remove the principal image from the scene-generation app path"
layer: "app"
deps: ["T4"]
acs: ["AC-08"]
files_hint:
  - "apps/api/src/services/storyboardIllustration.jobs.ts"
  - "apps/api/src/services/storyboardIllustration.status.ts"
  - "apps/api/src/services/storyboardIllustration.types.ts"
  - "apps/api/src/services/storyboardIllustration.service.ts"
owner: "Oleksii"
estimate: "M"
status: "todo"
---

# T5 — Зняти principal image зі scene-шляху (app)

## Why

Principal image retired через ignore-on-read — [ADR-0004](../adr/0004-retire-principal-image-by-ignoring-it-on-read.md), [spec AC-08](../spec.md), [sad §6 Flow 5](../sad.md); ревізія wire-типу — [contracts/openapi.yaml `StoryboardIllustrationStatus`](../contracts/openapi.yaml).

## What

- `storyboardIllustration.jobs.ts`: прибрати `ensureReadyReference` / `createReferenceJob` зі scene-старту (рядки ~172+).
- `storyboardIllustration.status.ts`: прибрати `getLatestReference` (рядок ~131) з readiness/status read.
- `storyboardIllustration.service.ts`: зняти всі читання `getLatestReference` / `ensureReadyReference` на scene-шляху (рядки ~116, 135, 177, 207, 228, 291).
- `storyboardIllustration.types.ts`: wire-тип без top-level `reference`; `automation.phase` без `creating_principal_image` / `awaiting_principal_approval`.
- Таблиця `storyboard_illustration_references` більше **не читається** на scene-шляху; рядки лишаються інертними (deferred DROP — поза фічею).

## Definition of Done

- [ ] Unit-тест: драфт із seeded legacy principal-рядком стартує/читається ідентично драфту без нього (ignore-on-read).
- [ ] Жодного импорту `storyboardIllustrationReference.repository` на scene-шляху (grep чистий).
- [ ] Жодної principal-генерації не enqueue-иться на старті; status read — суто persisted query.
- [ ] lint + typecheck чисті.

## Notes

Lane T3/T4/T5 (спільний service.ts). `storyboardIllustrationReference.repository.ts` сам по собі не видаляти — ним користуються non-scene шляхи до T6; видалення мертвого коду завершує T6.
