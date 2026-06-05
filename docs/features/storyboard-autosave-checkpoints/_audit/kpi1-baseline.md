# KPI-1 baseline — history write-rate (pre-release)

> Closes spec §8 OQ-3 («хто знімає тижневий базлайн KPI-1») та sad §11 open-question row.
> Рішення: dev знімає тижневий SQL-підрахунок до release-гілки (дефолт підтверджено).

## Measurement

- **Author:** Oleksii (solo dev) — Tech Lead default per OQ-3.
- **Taken:** 2026-06-05, на dev-БД `cliptale@localhost:3306` (єдине доступне середовище
  до релізу; продова БД на момент зняття не має фічі, тому той самий SQL треба повторити
  на проді безпосередньо перед release-гілкою — команда нижче).
- **Window:** 7 діб (2026-05-29 → 2026-06-05).

## SQL

```sql
-- KPI-1: тижневий темп створення history-рядків (до релізу = всі per-change writes)
SELECT COUNT(*)                    AS rows_7d,
       COUNT(DISTINCT draft_id)    AS drafts_7d
  FROM storyboard_history
 WHERE created_at >= NOW() - INTERVAL 7 DAY;

-- Розбивка за походженням (після міграції 051 legacy = до-фічеві per-change writes)
SELECT origin, COUNT(*) AS n
  FROM storyboard_history
 WHERE created_at >= NOW() - INTERVAL 7 DAY
 GROUP BY origin;
```

## Baseline numbers (dev, 2026-06-05)

| Metric | Value |
|---|---|
| History rows written, last 7 days | **40** |
| Distinct drafts with writes, last 7 days | 1 |
| → rows per draft per week (per-change model) | **40** |
| Rows by origin (7d) | legacy: 40, checkpoint: 0 |
| Total rows in table | 90 |

## How KPI-1 is judged after release

KPI-1 (spec §7 / sad §10 QG-1): кілька змін в межах одного autosave interval →
**≤ 1 History entry на інтервал на draft**. Після релізу повторити той самий SQL за
тиждень і порівняти `rows_7d / drafts_7d` проти базлайну (40/draft/тиждень на dev).
Очікування: падіння на порядок за того самого патерну редагування; додатково
`GROUP BY origin` має показувати лише `checkpoint`-приріст (нові legacy-рядки = регресія AC-02).
