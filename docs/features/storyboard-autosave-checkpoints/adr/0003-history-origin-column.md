---
status: Accepted
owner: "Architect / Tech Lead"
reviewers: ["Tech Lead"]
updated_at: "2026-06-05"
feature_size: "M"
ticket: "n/a"
---

# 0003 — Mark checkpoint history rows with an origin column

- **Status:** Accepted
- **Date:** 2026-06-05
- **Deciders:** Architect + Steven Hayes (PM), Socratic walk §4

## Context

AC-08: History-панель показує лише checkpoint-записи; легасі-записи (створені до фічі, per-change) приховані, але не видалені. Таблиця `storyboard_history` сьогодні має лише `id, draft_id, snapshot (JSON), created_at` — жодної ознаки походження запису. Треба обрати механізм розрізнення.

## Decision drivers

- AC-08 (фільтр легасі) + інваріант CONTEXT «панель показує лише записи checkpoint save».
- NFR: частка minimap-фолбеків рахується server-side — потрібен дешевий запит.
- NFR: History panel load p95 ≤ 500 мс — фільтр має бути індексованим, не пост-обробкою.
- Конвенція §2: MySQL 8, raw SQL, нумеровані міграції з дешевим ALTER.

## Considered options

1. **Колонка `origin` у БД** — міграція додає колонку (легасі-дефолт для існуючих рядків; нові checkpoint-и пишуться з `'checkpoint'`); список фільтрує `WHERE origin = 'checkpoint'` у SQL.
2. **Поле всередині snapshot JSON** — без DDL; фільтр через `JSON_EXTRACT` або пост-обробку 50 рядків на бекенді/фронті.
3. **Timestamp-cutoff** — усе після дати релізу фічі вважається checkpoint-ом.

## Decision outcome

**Chosen:** Option 1 — колонка `origin`. JSON-поле робить SQL-фільтр і серверний підрахунок фолбеків незграбними (без індексу — повний перебір рядків draft-а); timestamp-cutoff крихкий (дата зашита назавжди, межа «пливе» при поетапному релізі/відкаті). Точна форма колонки (ENUM vs VARCHAR, індекс, чи розширюється на pre-restore тип) — на етапі `data-model`.

## Consequences

**Positive**
- Фільтр панелі та підрахунок фолбеків — індексовані запити; prune може рахувати кап окремо по типах записів.
- Майбутні типи записів (наприклад, pre-restore checkpoint) розширюють значення колонки без нової міграції механізму.

**Negative**
- Одна міграція схеми (дешевий ALTER із дефолтом на існуючі рядки).

**Neutral**
- Легасі-рядки лишаються в сховищі й старіють через існуючий prune-механізм (spec Non-goal: без чищення легасі).

## Links

- Spec: [[../spec.md]] AC-08; §6 NFR (fallback share, panel load)
- SAD: [[../sad.md]] §4, §5
- Related ADR: [[0002-client-owned-checkpoint-scheduler]]
