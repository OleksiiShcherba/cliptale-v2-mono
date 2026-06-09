---
id: T7
title: "Select exactly one reference output per linked block in the worker selection module"
layer: "domain"
deps: []
acs: ["AC-05", "AC-06", "AC-06b"]
files_hint:
  - "apps/media-worker/src/jobs/referenceSelection.ts"
  - "apps/media-worker/src/jobs/referenceSelection.test.ts"
owner: "Oleksii"
estimate: "M"
status: "todo"
---

# T7 — Один selected output на блок у worker-selection

## Why

Multi-candidate selection предка retired — рівно один output на лінкований блок: [ADR-0003](../adr/0003-feed-each-linked-block-a-single-selected-reference-output.md), selection-правило з SQL — [data-model.md §storyboard_reference_stars](../data-model.md), потік — [sad §6 Flow 3](../sad.md).

## What

У `apps/media-worker/src/jobs/referenceSelection.ts`:

- `selectSceneReferences`: замість top-up-to-model-capacity повертати **один** output на лінкований блок — primary star (`is_primary = 1`), якщо його `file_id` серед usable outputs блока (Q5 point-lookup); інакше latest completed (`ORDER BY created_at DESC, file_id DESC LIMIT 1`, Q6).
- `checkScopedStarGate` (рядок ~105): рудимент захисту-в-глибину переводиться з star-вимоги на output-existence (інакше unstarred блок валив би джобу, яку api-гейт уже пропустив); api лишається джерелом правди.
- Reference boundary незмінний: читаються лише блоки, лінковані до сцени (Q7).

## Definition of Done

- [ ] Unit-тести: primary star usable → саме він; primary star видалений (`deleted_at`) → fallback latest completed; без зірки → latest completed; tie на `created_at(3)` → детермінізм по `file_id`; unstarred ready блок **не** валить джобу.
- [ ] Жоден output нелінкованого блока не потрапляє у вибірку (інваріант — unit-рівень; інтеграційний у T12).
- [ ] lint + typecheck чисті.

## Notes

Паралельна гілка — не залежить від api-задач. Lane спільна з T8/T12 (worker jobs). Старіння більше нічого не гейтить — лише обирає.
