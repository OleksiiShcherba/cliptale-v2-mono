---
status: Accepted
owner: "Tech Lead (Oleksii)"
reviewers: ["Tech Lead"]
updated_at: "2026-06-06"
feature_size: "L"
ticket: ""
---

# 0010 — Derive the draft badge from the block→flow link, not a column on flows

- **Status:** Accepted
- **Date:** 2026-06-06
- **Deciders:** Tech Lead (Oleksii) + design Socratic walk

## Context

Авто-створені reference flows зʼявляються в списку Generate AI з бейджем драфта (AC-12); видалення блока або драфта знімає бейдж, але флоу виживає (AC-14, AC-14b); видалення флоу попереджає про залежний блок (AC-12). Треба обрати носій звʼязку block↔flow і походження бейджа.

## Decision drivers

- AC-14/AC-14b: бейдж зникає при видаленні блока ТА драфта — два шляхи, які легко розсинхронізувати з денормалізованим записом.
- 1:1-інваріант глосарію: блок посилається рівно на один флоу.
- Мінімальний дотик до чужої таблиці `generation_flows` (домен generate-ai-flow).

## Considered options

1. **Звʼязок тільки на боці блока (FK `flow_id` у рядку reference-блока, nullable → no-flow state); бейдж = JOIN-похідна** — `EXISTS(блок, що посилається на флоу)`.
2. **Денормалізована колонка `origin_draft_id` на `generation_flows`** — список флоу без JOIN, але бейдж треба явно чистити у двох місцях (видалення блока і драфта) — ризик вічного бейджа всупереч AC-14.

## Decision outcome

**Chosen:** Option 1. Немає рядка — немає бейджа: видалення блока чи драфта знімає бейдж автоматично, нічого не розсинхронізується; delete-warning флоу — той самий JOIN; таблиця generate-ai-flow не мігрується.

## Consequences

**Positive**
- AC-14/AC-14b виконуються конструктивно, без cleanup-коду.
- `flow_id` nullable природно виражає no-flow state (AC-12).

**Negative**
- Список флоу отримує +1 індексований JOIN (дешевий; перевіряється NFR-метрикою списку флоу generate-ai-flow).

**Neutral**
- Майбутній крос-драфт переюз (non-goal зараз) потребуватиме окремої моделі звʼязку — цей ADR його не блокує й не відкриває.

## Links

- Spec: [[../spec.md]] AC-12, AC-14, AC-14b
- SAD: [[../sad.md]] §5 (D5.3)
- Related ADR: [[0005-dedicated-sql-tables-for-curation-data]], [[0006-unlink-on-duplicate-revalidate-on-restore]]
