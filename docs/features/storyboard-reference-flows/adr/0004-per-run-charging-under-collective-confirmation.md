---
status: Accepted
owner: "Tech Lead (Oleksii)"
reviewers: ["Tech Lead"]
updated_at: "2026-06-06"
feature_size: "L"
ticket: ""
---

# 0004 — Charge per run at start under the collective confirmation

- **Status:** Accepted
- **Date:** 2026-06-06
- **Deciders:** Tech Lead (Oleksii) + design Socratic walk

## Context

Колективне кост-підтвердження (одна агрегатна оцінка на весь каст) — свідоме scoped-відхилення від per-generate правила generate-ai-flow; воно покриває лише перші запуски авто-створених флоу. Відкритим був момент списання грошей: одним батчем при confirm чи пер-ран при реальному старті.

## Decision drivers

- Spec §6 NFR: фактична сума в межах ±10% показаної оцінки (billing telemetry).
- Spec §8 OQ-2 (default): failed first run = існуючий per-run retry з новим списанням.
- §2: нуль нових білінг-примітивів; generate-ai-flow вже списує пер-ран.
- Quality goal 1 (кост-безпека): жодного списання за генерацію, яка не стартувала.

## Considered options

1. **Списання пер-ран при старті** — confirm фіксує згоду + оцінку; кожен запуск списується окремо в момент старту в rolling window (існуючий механізм generate-ai-flow).
2. **Передоплата всієї суми при confirm** — простий контракт «підтвердив = заплатив», але потребує нової refund-механіки для незапущених/видалених блоків і розбіжності оцінка-vs-факт.

## Decision outcome

**Chosen:** Option 1. Повторне використання всього білінг-коду флоу; видалення блока до старту його генерації просто не списує грошей (рефанд не потрібен); агрегатна оцінка = сума пер-флоу оцінок через існуючий `flow-pricing` (`getPriceForModel` + `flow_model_pricing` override).

## Consequences

**Positive**
- Нуль нової refund-механіки; узгодженість із відкладеним OQ generate-ai-flow про рефанди.
- AC-04 (partial failure) працює природно: failed run → retry → нове пер-ран списання.

**Negative**
- Фактична сума може відхилятись від оцінки (зміна цін між confirm і стартом) — тому NFR ±10% моніториться через billing telemetry (§7).

**Neutral**
- Якщо колись зʼявиться передоплатний продукт (кредити-пакети) — confirm-точка вже існує як місце інтеграції.

## Links

- Spec: [[../spec.md]] §1 ¶4 (deliberate deviation), AC-03, §6 NFR (±10%), §8 OQ-2
- SAD: [[../sad.md]] §4 (D4.5)
- Related ADR: [[0003-db-state-rolling-window-with-worker-completion-hook]]
