---
status: Accepted
owner: "Tech Lead (Oleksii)"
reviewers: ["Tech Lead"]
updated_at: "2026-06-06"
feature_size: "L"
ticket: ""
---

# 0002 — Run cast extraction as a new job type on the storyboard-plan queue

- **Status:** Accepted
- **Date:** 2026-06-06
- **Deciders:** Tech Lead (Oleksii) + design Socratic walk

## Context

Каст-екстракція читає скрипт драфта через LLM і пропонує персонажів/оточення, призначення завантажених зображень та scene links. NFR: p95 ≤ 60 с від старту до показу пропозиції — задовго для синхронного HTTP-запиту. Треба обрати механізм виконання.

## Decision drivers

- Spec §6 NFR: «async job telemetry (same channel as the existing storyboard planning queue)» — спека сама прив'язує вимірювання до plan-черги.
- §2 Constraints: нуль нової інфри.
- Quality goal 2 (швидкість циклу курації): результат мусить переживати розрив зʼєднання; прогрес — через існуючий Redis pub/sub → WebSocket.
- Прецедент: storyboard planning job (той самий LLM-провайдер, той самий repository-патерн `storyboardPlanJob.repository.ts`).

## Considered options

1. **Новий тип джоби на існуючій черзі `storyboard-plan`** — нуль нової інфри, той самий патерн і телеметрія.
2. **Окрема нова черга `cast-extract`** — ізоляція пропускної здатності, але новий інфра-компонент усупереч §2 і зайвий моніторинг.
3. **Синхронний HTTP-виклик** — найпростіше, але 60-секундний запит ламається об таймаути проксі, результат губиться при розриві, ретраї дублюють виклики LLM.

## Decision outcome

**Chosen:** Option 1. Спека явно міряє NFR через канал plan-черги; прецедентний код мінімізує нову поверхню помилок; §2 забороняє нову інфру без Override.

## Consequences

**Positive**
- Повторне використання job-row + realtime-патерну; екстракція автоматично отримує retry/телеметрію черги.
- Скрипт у промпт іде як data (захист від prompt injection — spec §6.1) у тому ж місці, де це вже зроблено для planning.

**Negative**
- Важкі plan-джоби та екстракція ділять пропускну здатність однієї черги — при заторі обидві сповільнюються (моніториться через worker queue metrics, §7).

**Neutral**
- Якщо колись знадобиться ізоляція — винесення в окрему чергу є механічним (BullMQ), без зміни контракту джоби.

## Links

- Spec: [[../spec.md]] §6 NFR (екстракція ≤ 60 с), §6.1 (prompt injection)
- SAD: [[../sad.md]] §4 (D4.3)
- Related ADR: [[0003-db-state-rolling-window-with-worker-completion-hook]]
