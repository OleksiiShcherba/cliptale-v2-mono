---
id: T1
title: "Promote staged curation migrations 01–04 into the live migration tree"
layer: "migration"
deps: []
acs: ["AC-06", "AC-07", "AC-10b"]
files_hint:
  - "docs/features/storyboard-reference-flows/migrations/01_create_storyboard_cast_extraction_jobs.up.sql"
  - "docs/features/storyboard-reference-flows/migrations/02_create_storyboard_reference_blocks.up.sql"
  - "docs/features/storyboard-reference-flows/migrations/03_create_storyboard_reference_scene_links.up.sql"
  - "docs/features/storyboard-reference-flows/migrations/04_create_storyboard_reference_stars.up.sql"
owner: "Oleksii"
estimate: "S"
status: "todo"
---

# T1 — Promote staged curation migrations 01–04

## Why

Чотири таблиці курації — фундамент усіх шарів (ADR-0005). Походить з [data-model.md](../data-model.md) і staged-пар у [migrations/](../migrations/); схемні інваріанти закривають частини [AC-06/AC-07/AC-10b](../spec.md).

## What

Промоутнути 4 staged up/down пари у live `apps/api/src/db/migrations/` (наступні вільні номери, конвенція іменування репо), нічого не переписуючи по суті: `storyboard_cast_extraction_jobs`, `storyboard_reference_blocks`, `storyboard_reference_scene_links`, `storyboard_reference_stars`.

## Definition of Done

- [ ] Усі 4 up-міграції застосовуються на чистій і на існуючій БД (in-process runner, `APP_MIGRATE_ON_BOOT`)
- [ ] Усі 4 down-міграції відкочуються чисто у зворотному порядку
- [ ] Constraints перевірені вручну/тестом: UNIQUE `flow_id` (1:1), UNIQUE `(reference_block_id, is_primary)`, FK-каскади links/stars
- [ ] lint + typecheck не гірші за baseline (pre-existing-broken — див. repo gate realities)

## Notes

Serialized lane (layer: migration). Порядок строго 01→04 — FK залежності.
