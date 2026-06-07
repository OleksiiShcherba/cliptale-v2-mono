---
id: T8
title: "Build block-lifecycle service: manual add (no run, no charge), update, delete (flow survives), retry, versioned scene-link save"
layer: "app"
deps: ["T2", "T3"]
acs: ["AC-04", "AC-10", "AC-10b", "AC-11", "AC-13", "AC-14"]
files_hint:
  - "apps/api/src/services/storyboardReference.blocks.service.ts"
  - "apps/api/src/services/storyboardReference.blocks.service.test.ts"
owner: "Oleksii"
estimate: "L"
status: "todo"
---

# T8 — Block lifecycle + versioned scene-link save

## Why

[sad §6 Flows 5, 8, 9](../sad.md): ручне додавання після підтвердження (AC-11), видалення блока з виживанням флоу (AC-14), retry першої генерації (AC-04), versioned-збереження scene links (NFR concurrency, Override sad §1 ¶4).

## What

`storyboardReference.blocks.service.ts` (усе owner-scoped):

- `list(draftId)`: блоки в cast-порядку з превʼю (primary star), статусами, лінками — живить канвас (NFR ≤ 1500 ms @ ≤ 50 блоків).
- `create`: ручний блок (character/environment) + порожній 1:1 флоу, `window_status=NULL`, **без генерації і списань**; ліміт 12 НЕ застосовується (тільки existing creation rate limits).
- `update`: name/description/позиція.
- `delete`: блок + його лінки й зірки (FK), **флоу і результати виживають** (badge зникає сам — derived, ADR-0010); блок вибуває зі star gate.
- `retry`: для `window_status='failed'` — повторний enqueue з новим списанням (ADR-0004) → `pending`/`running`.
- `saveSceneLinks`: replace-set під CAS по `version` (T2+T3); stale version → типізований conflict (ports → 409 + reload prompt).

## Definition of Done

- [ ] Тест: create — порожній флоу, нічого в черзі, нуль списань; 13-й ручний блок дозволений
- [ ] Тест: delete — флоу/результати на місці, лінки/зірки зникли, гейт більше не рахує блок
- [ ] Тест: retry на failed → нова джоба; на done/pending → відмова
- [ ] Тест: два конкурентні saveSceneLinks → один успіх + один conflict; жодна правка не загублена мовчки
- [ ] Тест: не-власник на кожну операцію → відмова без розкриття
- [ ] lint + typecheck не гірші за baseline

## Notes

Найширша app-задача — тримати сервіс тонким над T2/T3; якщо росте за день, відщепити `saveSceneLinks` окремим PR у тій самій lane.
