# Audit — data-model — scene-generation-reference-gate — 2026-06-09

## Outcome

**Brownfield delta, нуль нових схемних обʼєктів.** Reference-done gate (ADR-0002) і
single-output selection (ADR-0003) повністю обслуговуються наявною схемою (міграції 031,
046–048, 053–055) і наявними індексами — `data-model.md` документує 7 запитів gate-шляху
(Q1–Q7) з покриттям кожного. Дрейфу домен↔схема не виявлено.

## Staged migrations

| File | Status |
|---|---|
| `docs/features/scene-generation-reference-gate/migrations/_deferred/01_drop_storyboard_illustration_references.up.sql` | **DEFERRED** — НЕ промоутиться з фічею |
| `docs/features/scene-generation-reference-gate/migrations/_deferred/01_drop_storyboard_illustration_references.down.sql` | пара до up; відновлює лише схему (DROP lossy — зафіксовано в шапці) |

**Міграції стейджені — НЕ в живому `apps/api/src/db/migrations/`.** У складі самої фічі
міграцій **нуль** (`implement` для цієї фічі нічого не промоутить — `_deferred/` явно
виключено умовами в шапці файлу).

## Promote-time convention hint

Репо: одинарні файли `NNN_description.sql` (sequential), in-process runner
(`apps/api/src/db/migrate.ts`) із SHA-256 checksums; **наступний номер ≈ `057`** — реальний
номер присвоюється на промоуті (інша фіча може промоутитись першою). На промоуті `.up.sql`
стає `0NN_drop_storyboard_illustration_references.sql`, а вміст `.down.sql` переноситься в
коментар «Manual rollback» — конвенція репо (down-файлів живе дерево не має).

**Умови промоуту deferred-міграції (всі):** (1) фіча повністю розкатана, principal-код
вилучено з api/worker/web; (2) KPI `principal_image_generations = 0` тримається 7 днів
post-rollout (spec §7); (3) відкат фічі більше не планується.

## Resolved decision (spec §8 OQ-1)

Row-доля legacy `storyboard_illustration_references`: **відкладений DROP** (підтверджено
користувачем 2026-06-09 через AskUserQuestion; рекомендований варіант). Ignore-on-read у
рантаймі (ADR-0004) — без змін; рядки інертні до промоуту. Варіант «backfill» відхилено без
винесення на вибір: одне principal-зображення не мапиться в per-cast блоки (нема цільової
семантики). Варіант «DROP разом із фічею» відхилено: ламає шлях відкату (старий код читає
таблицю) і має вікно гонки зі старим worker-ом під час деплою.

## Convention deviations

- Стейджена пара `.up.sql`/`.down.sql` ≠ одинарні файли живого дерева — **навмисно** (правило
  стадії: повна reversibility на staging-етапі); реконсиляція описана в promote-hint вище.
- Інших відхилень немає: жодного нового DDL, конвенції (UUID v4 CHAR(36), DATETIME(3) audit,
  soft-delete, явні FK-індекси, idempotent DDL) у deferred-парі дотримані.

## Index decisions

- **Нових індексів 0.** Кожен запит Q1–Q7 покритий наявним індексом (таблиця «Queries →
  indexes» у data-model.md).
- Свідомо НЕ додано `(flow_id, deleted_at, created_at)` на `flow_files` для Q6 (latest
  completed output): префікс PK `(flow_id, …)` обмежує скан outputs одного flow (десятки
  рядків), filesort мізерний, NFR p95 ≤ 500 мс не під загрозою — індекс був би "just in case".

## Drift report

`storyboardReference.repository.ts` ↔ 053, `storyboardReferenceCuration.repository.ts` ↔
054–055, `flow-file.repository.ts` ↔ 047: field-without-column 0, column-without-field 0,
type-mismatch 0, nullability-mismatch 0. `_drift/` не створювався.

## Self-checks (4/4 PASS)

1. **Naming** — deferred-файл відповідає `verb_entity`; промоут-конвертація описана. ✓
2. **Down reversibility** — DROP TABLE ↔ CREATE TABLE (повний DDL 040+041); lossy-природа
   DROP явно зафіксована в обох файлах. ✓
3. **FK indexes** — нових FK немає; down відтворює всі оригінальні індекси (включно з FK-покриттям). ✓
4. **Convention adherence** — нуль нового DDL; відхилення зафіксовані вище, нічого не
   занесено мовчки. ✓

## TBD

Немає — `<!-- TBD -->` у data-model.md відсутні.

## Next stage

`/sdd:api scene-generation-reference-gate`
