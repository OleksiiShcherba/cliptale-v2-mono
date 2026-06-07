---
status: Accepted
owner: "Tech Lead (Oleksii)"
reviewers: ["Tech Lead"]
updated_at: "2026-06-06"
feature_size: "L"
ticket: ""
---

# 0008 — Select scene references as each linked block's primary star, topped up to model capacity

- **Status:** Accepted
- **Date:** 2026-06-06
- **Deciders:** Tech Lead (Oleksii) + design Socratic walk

## Context

Сцена X може лінкувати кілька блоків, кожен із кількома starred results, а image-модель приймає обмежену кількість референс-зображень (reference capacity залежить від моделі). Потрібне детерміноване правило вибору в межах reference boundary (spec §8 OQ-5, due before sdd:design).

## Decision drivers

- AC-09 (reference boundary): тільки starred images лінкованих блоків, ніколи — нелінкованих.
- Глосарій: primary starred result — головне зображення-репрезентант блока.
- Справедливість між блоками: кожен лінкований блок має бути представлений мінімум одним зображенням, перш ніж хтось отримає друге.

## Considered options

1. **Primary star кожного лінкованого блока + добір зірок до місткості моделі** — спершу по одному primary на блок (гарантія представлення кожного персонажа/оточення), потім решта зірок у порядку зіркування, поки є місткість.
2. **Усі зірки всіх лінкованих блоків, обрізані за лімітом** — простіше, але блок із 10 зірками може витіснити блок з однією — персонаж «зникає» зі сцени.
3. **LLM сам обирає підмножину** — гнучко, але недетерміновано: той самий драфт дає різні набори референсів між запусками; неможливо пояснити Creator-у, чому референс не використано.

## Decision outcome

**Chosen:** Option 1. Гарантує представлення кожного лінкованого блока (суть консистентності), детермінований і пояснюваний; primary star уже існує доменно як «репрезентант» блока.

## Consequences

**Positive**
- KPI «reference utilization ≥ 80%» підтримується конструктивно: кожен лінкований блок із зіркою потрапляє в генерацію.
- Поведінка відтворювана й тестована (unit-тест на правило вибору).

**Negative**
- При місткості меншій за кількість лінкованих блоків частина блоків лишиться без представлення — обираються в порядку лінкування; це межа моделі, не правила.

**Neutral**
- Правило живе в scene generation master (worker) як чиста функція — змінюване без міграцій.

## Links

- Spec: [[../spec.md]] §8 OQ-5, AC-09
- SAD: [[../sad.md]] §4 (D4.7.5)
- Related ADR: [[0007-style-description-from-starred-results-at-generation-time]]
