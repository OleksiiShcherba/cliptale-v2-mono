---
status: Accepted
owner: "Tech Lead (Oleksii)"
reviewers: ["Tech Lead"]
updated_at: "2026-06-06"
feature_size: "L"
ticket: ""
---

# 0009 — Store stars as curation rows referencing flow result files

- **Status:** Accepted
- **Date:** 2026-06-06
- **Deciders:** Tech Lead (Oleksii) + design Socratic walk

## Context

Зірка ставиться на result-блоці всередині флоу-канвасу, але читається ззовні: star gate, превʼю блока (primary star), scene generation master. Результат генерації фізично — файл (`flow_files` звʼязує флоу з асетами). Канвас флоу — opaque JSON з optimistic lock; куди писати зірку?

## Decision drivers

- Quality goal 3: зірка не сміє губитися через optimistic-lock конфлікт з автосейвом канвасу.
- AC-06/AC-07: primary star → превʼю блока; un-star/видалення → fallback або no-preview.
- ADR-0005: дані курації — у виділених таблицях; ADR-0011: гейт читає зірки прямим SQL.

## Considered options

1. **Зірка = рядок у таблиці курації з FK на файл результату + FK на reference-блок, прапорець `is_primary`** — SPA ставить/знімає зірку легким ендпоінтом без перезапису канвас-JSON.
2. **Прапорець `starred` усередині канвас-JSON флоу** — нуль нових таблиць, але кожна перевірка гейта парсить JSON усіх флоу драфта; збереження зірки = повний сейв канвасу з optimistic lock, що конфліктує з автосейвом відкритого флоу.

## Decision outcome

**Chosen:** Option 1. Узгоджено з ADR-0005; зірка зберігається атомарно власним ендпоінтом, жодних конфліктів з автосейвом канвасу; гейт і master читають індексованим запитом. Точну схему (колонки/індекси) фіксує стадія data-model.

## Consequences

**Positive**
- Жодних optimistic-lock конфліктів зірок з автосейвом канвасу (quality goal 3).
- Гейт/превʼю/master — прості SQL-запити.

**Negative**
- Видалення result-блока або його файлу в канвасі флоу мусить синхронно чистити відповідні зірки (AC-07) — явна точка дотику в generation-flow.service.

**Neutral**
- Зірка scoped до пари блок↔флоу (не library favorite) — узгоджено з глосарієм.
- Конкурентність (Override SAD §1 ¶4, critic F1): toggle зірки — безверсійна комутативна операція (конкурентні правки сходяться, нічого не губиться мовчки); збереження списку scene links — compare-and-set по версії блока → конфлікт = відмова + reload-prompt (реалізує NFR spec §6 concurrency safety).

## Links

- Spec: [[../spec.md]] AC-06, AC-07, AC-08
- SAD: [[../sad.md]] §5 (D5.2)
- Related ADR: [[0005-dedicated-sql-tables-for-curation-data]], [[0011-star-gate-in-api-service-at-generation-start]]
