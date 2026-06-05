---
status: Accepted
owner: "Architect / Tech Lead"
reviewers: ["Tech Lead"]
updated_at: "2026-06-05"
feature_size: "M"
ticket: "n/a"
---

# 0002 — Run the checkpoint scheduler in the browser client

- **Status:** Accepted
- **Date:** 2026-06-05
- **Deciders:** Architect + Steven Hayes (PM), Socratic walk §4

## Context

Checkpoint save має відбуватися раз на autosave interval (або вручну), з дефералом під час drag/typing, простроченим запуском після повернення вкладки (AC-03c) і pre-restore checkpoint-ом (AC-12). Треба вирішити, хто володіє цим розкладом — браузер чи сервер.

## Decision drivers

- Layout screenshot можливий лише в живому DOM браузера — `html-to-image` рендерить видимий канвас; сервер не має джерела зображення (технічний констрейнт §2).
- Quality goal №1: ≤ 1 History entry на інтервал на draft (spec §6 NFR).
- Quality goal №2: checkpoint ніколи не зникає мовчки — скриншот і снапшот мають лишатися атомарними.
- Деферал, countdown bar і visibility-поведінка — суто клієнтські сигнали (drag/typing/`visibilitychange`).

## Considered options

1. **Клієнтський планувальник** — браузер веде countdown-таймер, деферал, visibility-обробку; знімає скриншот і шле готовий checkpoint одним запитом; бекенд — тонкий CRUD із валідацією.
2. **Серверна коалесценція** — клієнт шле записи per-change як сьогодні; сервер у межах інтервалу оновлює останній запис замість створення нового.

## Decision outcome

**Chosen:** Option 1 — клієнтський планувальник. Option 2 не розв'язує половину проблеми (браузер далі знімав би скриншот на кожну зміну або потребував би власного таймера — подвійна логіка), а countdown bar і деферал однаково вимагають клієнтського таймера. Один запит = снапшот + скриншот атомарно.

**Мульти-таб / мульти-девайс політика: last-writer-wins, як сьогодні** (закриває spec §8 OQ-1, дефолт PM). Кожна вкладка незалежна; реальної колаборації в продукті немає.

## Consequences

**Positive**
- Єдине місце правди про взаємодію користувача (drag/typing/visibility) — там, де вона відбувається.
- Бекенд-зміни мінімальні: валідація + маркер origin (ADR-0003); навантаження на запис падає з per-change до per-interval.
- Скриншот і снапшот в одному POST — нема режиму «запис є, прев'ю загубилось».

**Negative**
- Розклад залежить від стану вкладки: фонова вкладка призупиняє таймери → обов'язкова явна обробка `visibilitychange` із простроченим checkpoint-ом ≤ 10 с (AC-03c).
- Дві активні вкладки одного draft-а можуть дати до 2 checkpoint-ів на інтервал — прийнятий рідкісний режим, ризик-рядок у sad.md §11.

**Neutral**
- Якщо колись з'явиться колаборація, політику last-writer-wins доведеться переглянути окремим ADR (stale-tab guard / leader election); це рішення не блокує такий перехід.

## Links

- Spec: [[../spec.md]] AC-03, AC-03b, AC-03c, AC-07, AC-12; §8 OQ-1
- SAD: [[../sad.md]] §4, §6
- Related ADR: [[0001-fullstack-web-and-backend-surfaces]], [[0005-inline-data-url-screenshot]]
