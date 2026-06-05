---
status: Accepted
owner: "Architect / Tech Lead"
reviewers: ["Tech Lead"]
updated_at: "2026-06-05"
feature_size: "M"
ticket: "n/a"
---

# 0005 — Keep layout screenshots as inline data-URLs in the snapshot JSON

- **Status:** Accepted
- **Date:** 2026-06-05
- **Deciders:** Architect + Steven Hayes (PM), Socratic walk §4

## Context

Кожен checkpoint несе layout screenshot (JPEG 320×180, ~15–25 КБ) як прев'ю History entry. Сьогодні прев'ю зберігається data-URL-ом усередині JSON-снапшота в `storyboard_history`. S3 уже в стеку для медіа — треба вирішити, чи виносити скриншоти туди.

## Decision drivers

- Quality goal №2: checkpoint ніколи не зникає мовчки — мінімум режимів збою на шляху запису.
- Кап 50 записів на draft → ≤ ~1.5 МБ історії на draft у MySQL — у межах комфорту InnoDB.
- Навантаження на запис уже впало з per-change до per-interval — оптимізувати далі нема чого.
- §2: нуль нових залежностей/інфраструктури для фічі.

## Considered options

1. **Інлайн data-URL у snapshot JSON** — скриншот їде в тому ж POST, що й снапшот; зберігається в JSON-колонці.
2. **S3-об'єкт + ключ у БД** — клієнт/api вивантажує JPEG у S3; в історії лише посилання; читання через presigned URL.

## Decision outcome

**Chosen:** Option 1 — інлайн data-URL. Двофазний запис S3-варіанту створює нові режими збоїв (сироти-об'єкти при збої запису рядка, биті прев'ю при збої вивантаження), що прямо суперечить quality goal №2; додає чищення при prune і при видаленні draft-а. Виграш (легша БД) не потрібен при ≤ 1.5 МБ на draft.

## Consequences

**Positive**
- Атомарність: запис і прев'ю не роз'їжджаються — один POST, одна транзакція.
- Нуль нової інфраструктури: без пресайнів, без garbage-collection сиріт.

**Negative**
- Відповідь списку історії важка (до ~1.25 МБ на 50 записів) — NFR «панель ≤ 500 мс p95» вимірюється саме з цим навантаженням (сьогоднішня поведінка така сама).

**Neutral**
- Якщо прев'ю колись стануть більшими (full-size, шерінг) — перехід на S3 можливий окремим ADR із backfill-міграцією.

## Links

- Spec: [[../spec.md]] AC-03, AC-04; §6 NFR (panel load, fallback share)
- SAD: [[../sad.md]] §4, §5
- Related ADR: [[0002-client-owned-checkpoint-scheduler]], [[0003-history-origin-column]]
