---
status: Accepted
owner: "Tech Lead (Oleksii)"
reviewers: ["Tech Lead"]
updated_at: "2026-06-06"
feature_size: "L"
ticket: ""
---

# 0005 — Store curation data in dedicated SQL tables, not canvas JSON

- **Status:** Accepted
- **Date:** 2026-06-06
- **Deciders:** Tech Lead (Oleksii) + design Socratic walk

## Context

Reference-блоки, scene links і зірки — дані курації, які читає бекенд без участі фронтенда: star gate перевіряє «кожен блок драфта має ≥1 зірку», scene generation master читає «які блоки лінковані до сцени X і які їхні starred images», видалення сцени чистить лінки, список флоу показує draft badge. У репо два патерни: окремі SQL-таблиці (music blocks, міграція 045) і opaque canvas-JSON (канвас generation flow, ADR-0002 generate-ai-flow).

## Decision drivers

- Quality goal 3: видалення сцени не лишає dangling links (AC-10b) — FK-цілісність.
- AC-08/AC-09: star gate і reference boundary — серверні правила, що потребують прямих SQL-запитів.
- AC-12/AC-14/AC-14b: лайфцикл-семантики (badge, survival) живуть у зв'язках, не в документі.
- Зміна формату пізніше = міграція даних, виміряна тижнями (незворотність).

## Considered options

1. **Виділені SQL-таблиці** — reference-блоки (FK draft + flow), півот блок↔сцена для scene links, зірки; canvas JSON тримає лише XY-позицію блока. Точні схеми зафіксує стадія data-model.
2. **Усе в canvas JSON драфта** — одне джерело правди й автоверсіонування чекпоїнтами, але кожна бекенд-перевірка тягне й парсить весь JSON; зірки живуть в іншому документі (канвас флоу) — крос-документна консистентність без FK; optimistic-lock конфлікти між автосейвом і бекенд-апдейтами зірок.

## Decision outcome

**Chosen:** Option 1. Бекенд-правила (гейт, boundary, badge, dispatch вікна) — суть фічі; вони вимагають індексованих запитів і FK-цілісності, які JSON-документ не дає. Прецедент music blocks підтверджує патерн для off-chain блоків.

## Consequences

**Positive**
- Прямі SQL-запити для гейта/boundary; видалення сцени чистить лінки одним DELETE по FK.
- Зірка, поставлена на result-блоці флоу, одразу видима storyboard-стороні без парсингу двох JSON-документів.

**Negative**
- Більше міграцій (наступні номери після 051).
- Два носії для одного блока: XY-позиція в canvas JSON, суть у таблиці — при розбіжності виграє таблиця (блок без позиції рендериться в дефолтному місці, позиція без рядка ігнорується).

**Neutral**
- Чекпоїнт-відновлення канвасу не відновлює видалені куративні дані — узгоджено з ADR-0006 (re-validate).

## Links

- Spec: [[../spec.md]] AC-08, AC-09, AC-10b, AC-12, AC-14
- SAD: [[../sad.md]] §4 (D4.6), §5
- Related ADR: [[0006-unlink-on-duplicate-revalidate-on-restore]]
