---
status: Accepted
owner: "Tech Lead (Oleksii)"
reviewers: ["Tech Lead"]
updated_at: "2026-06-06"
feature_size: "L"
ticket: ""
---

# 0003 — Drive the rolling window from DB state with a worker completion-hook

- **Status:** Accepted
- **Date:** 2026-06-06
- **Deciders:** Tech Lead (Oleksii) + design Socratic walk

## Context

Після колективного підтвердження перші генерації всіх reference flows стартують у rolling window: максимум N одночасно (N — налаштування Creator-а, default 4), у cast-порядку, наступна стартує щойно одна завершилась. BullMQ (безкоштовна версія) не має пер-групової конкурентності — вікно треба оркеструвати самим.

## Decision drivers

- Spec §6 NFR: повний каст (≤ cast size limit) підхоплений воркером ≤ 5 хв після підтвердження — вікно не сміє «зависнути».
- Quality goal 3: стан переживає рестарти api/worker.
- AC-04: failed run не блокує інші блоки; retry повертає запуск у вікно.
- §2: нуль нової інфри (без BullMQ Pro).

## Considered options

1. **Стан у БД + worker completion-hook** — рядки pending → running → done/failed у cast-порядку; API enqueue-ить перші N; воркер по завершенні (успіх або провал) атомарно claim-ить наступний pending того ж драфта.
2. **Диспетчер в API за Redis pub/sub подіями** — воркер лишається «тупим», але pub/sub — fire-and-forget: пропущена подія = вікно зависає назавжди без відновлювального поллінгу.
3. **Enqueue-all + гейт у воркері** — ре-enqueue із затримкою ламає cast-порядок і забиває спільну чергу ai-generate пустими циклами.

## Decision outcome

**Chosen:** Option 1. Тільки БД-стан дає гарантований порядок, відновлюваність після рестартів і чесне «наступна стартує одразу після завершення» без гарантій доставки pub/sub.

## Consequences

**Positive**
- Вікно переживає будь-який рестарт: стан повністю відновлюваний із БД.
- Retry (AC-04) = повернути рядок у pending — той самий механізм.
- Cast-порядок гарантований сортуванням рядків.

**Negative**
- Воркер отримує оркестраційну логіку (раніше лише виконував) — completion-hook треба тримати ідемпотентним.
- Потрібен атомарний claim (UPDATE … WHERE status='pending' LIMIT 1) проти подвійного enqueue при конкурентних завершеннях.

**Neutral**
- N читається з `user_settings` на момент кожного диспетчу — зміна налаштування діє на наступний старт, не перериває running.

## Links

- Spec: [[../spec.md]] AC-03, AC-04, §6 NFR (staged auto-start)
- SAD: [[../sad.md]] §4 (D4.4)
- Related ADR: [[0002-cast-extraction-on-storyboard-plan-queue]], [[0004-per-run-charging-under-collective-confirmation]]
