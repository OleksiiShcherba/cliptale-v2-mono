---
id: T21
title: "Add the cross-layer e2e journey: extract → confirm → window → stars → gate → boundary-respecting scenes"
layer: "tests"
deps: ["T5", "T7", "T11", "T15", "T16", "T17", "T18", "T19", "T20"]
acs: ["AC-01", "AC-03", "AC-06", "AC-08", "AC-09", "AC-13", "AC-14b"]
files_hint:
  - "e2e/storyboard-reference-flows.spec.ts"
owner: "Oleksii"
estimate: "M"
status: "todo"
---

# T21 — E2E: повна reference-журні

## Why

Жодна шарова задача не доводить наскрізну поведінку: extract → confirm → rolling window → зірки → гейт → сцени в reference boundary ([sad §6 Flows 1–2](../sad.md)).

## What

Playwright-сценарій у кореневому `e2e/` (конвенції репо: seed-користувач, auth-кеш у `.e2e-cache/`, 15-хв rate limit логіну — без повторних логінів):

1. Seed-Creator стартує екстракцію → бачить proposal → коригує запис → confirm з естімейтом.
2. Блоки зʼявляються на канвасі; вікно доганяє статуси (realtime).
3. Відкриття флоу з блока → зірка + primary → back to storyboard → превʼю блока оновилося.
4. Старт scene previews з незірковим блоком → гейт називає блок; після зірки — старт проходить.
5. Сцена X отримує лише референси лінкованих блоків (перевірка через payload/результат API).
6. Другий користувач → відмова на reference-дані (AC-13).
7. Делішн драфта → флоу лишаються у списку без badge (AC-14b).

## Definition of Done

- [ ] Сценарій зелений локально проти docker-compose стека
- [ ] Не додає падінь до існуючого e2e-набору (6 pre-existing падінь у storyboard-fixes — не рахуються)
- [ ] lint + typecheck не гірші за baseline

## Notes

LLM/Image-провайдери — за існуючим патерном моків/фікстур e2e (не реальні виклики). Фінальна задача DAG.
