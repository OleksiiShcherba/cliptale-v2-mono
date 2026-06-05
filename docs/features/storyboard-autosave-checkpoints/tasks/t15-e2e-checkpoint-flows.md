---
id: T15
title: "E2E (Playwright): checkpoint flows, slow-capture fallback, settings journey"
layer: "tests"
deps: ["T4", "T5", "T6", "T14"]
acs: ["AC-03", "AC-04", "AC-05", "AC-07", "AC-08", "AC-09", "AC-10", "AC-12"]
files_hint:
  - "e2e/storyboard-checkpoints.spec.ts"
  - "e2e/settings.spec.ts"
owner: "Oleksii (solo dev)"
estimate: "L"
status: "todo"
---

# T15 — E2E (Playwright): checkpoint flows, slow-capture fallback, settings journey

## Why

Дві NFR вимірюються лише e2e (spec §6: loader ≤ 1 с p95 «e2e timing in CI»; capture-таймаут «e2e test forcing a slow capture»); наскрізна інтеграція фронт↔бек — перша точка, де гілки DAG сходяться.

## What

Нові spec-файли в існуючому `e2e/` (testDir із `playwright.config.ts`, helpers/global-setup — reuse):

- `storyboard-checkpoints.spec.ts`: зміна на дошці → countdown тікає → інтервальний checkpoint → новий entry зі скриншотом зверху панелі (AC-03); ручний Save → негайний checkpoint + reset відліку (AC-07); idle після checkpoint-а — Save неактивна, нових entries нема (AC-05); **примусово повільне зняття** (route-абортом/інʼєкцією затримки в html-to-image) → entry з мінімапою, loader знятий, checkpoint не загублений (AC-04 + NFR-таймаут); Restore з новішими змінами → pre-restore entry зверху, потім відновлення (AC-12); панель показує лише checkpoint-и при наявності легасі-рядка (AC-08, сід через API/SQL-хелпер).
- `settings.spec.ts`: Home → Settings → зміна пресета → підтвердження (AC-09); новий інтервал діє на наступному відліку дошки (AC-09/AC-10 — той самий акаунт, новий контекст браузера).
- Замір видимості loader-а (timestamp до/після) — заведення цифри в CI-звіт (QG-3).

## Definition of Done

- [ ] Усі сценарії зелені локально проти живого стека (compose) і в CI
- [ ] Slow-capture тест детерміновано форсує таймаут (без flaky sleep-ів)
- [ ] Використано існуючий seed-користувач/логін-хелпери (увага: 15-хв login rate limit — один логін на worker)
- [ ] lint + typecheck не гірші за базлайн

## Notes

AC-10 e2e обмежується «новий browser context» (другий пристрій недосяжний у CI) — акаунт-скоупність доведено інтеграційно в T4. Таймінги p95 — спот-числа CI, не статистика (sad: браузерної телеметрії в проді немає, accepted debt).
