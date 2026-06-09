---
id: T14
title: "Document the adopted defaults and close the spec open questions"
layer: "docs"
deps: ["T11", "T12", "T13"]
acs: ["AC-08"]
files_hint:
  - "docs/features/scene-generation-reference-gate/spec.md"
  - "docs/features/scene-generation-reference-gate/sad.md"
owner: "Oleksii"
estimate: "S"
status: "todo"
---

# T14 — Закрити OQ-2/OQ-3 + задокументувати known limitations

## Why

Spec §8 тримає два OQ із due «before sdd:tasks»; на стадії tasks (2026-06-09) прийнято їх задокументовані дефолти — слід зафіксувати в артефактах, щоб рішення не жило лише в голові ([spec §8](../spec.md), [sad §11](../sad.md)).

## What

- Spec §8 OQ-2 → закрити: reaper/force-fail застряглого reference-блока **out of scope** — вихід через наявні delete/retry; revisit якщо KPI `gate_deadlock_incidents` > 0.
- Spec §8 OQ-3 → закрити: **one-shot check at start** — mid-run регенерація референса не ре-валідується per scene; known limitation, узгоджено з accepted debt sad §11 (TOCTOU).
- Sad §11: перевести два «Open question»-рядки в resolved-стан із датою.
- Нагадування про deferred DROP: умова промоуту (`principal_image_generations = 0` 7 днів post-rollout) уже зафіксована в [data-model §Migrations](../data-model.md) — звірити, що формулювання не розійшлись.

## Definition of Done

- [ ] У spec §8 не лишилось жодного відкритого OQ без owner/рішення.
- [ ] Sad §11 без рядків зі статусом «Open question».
- [ ] Жодних змін коду — суто документація.

## Notes

Виконується останнім — якщо T11–T13 виявлять, що дефолт не тримається (наприклад, deadlock у тестах), OQ закривається іншим рішенням через `decide-adr`.
