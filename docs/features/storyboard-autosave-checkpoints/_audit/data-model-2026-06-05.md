# Audit — data-model — storyboard-autosave-checkpoints — 2026-06-05

## Staged migrations (НЕ в живому дереві)

**Міграції staged — їх ще немає в живому `apps/api/src/db/migrations/`; `implement` промоутить їх** при виконанні `layer: migration` задач.

| Staged file | Зміст |
|---|---|
| `docs/features/storyboard-autosave-checkpoints/migrations/01_create_user_settings.up.sql` | CREATE TABLE `user_settings` (user_id PK/FK CASCADE, settings_json JSON, updated_at DATETIME(3)) |
| `docs/features/storyboard-autosave-checkpoints/migrations/01_create_user_settings.down.sql` | DROP TABLE IF EXISTS |
| `docs/features/storyboard-autosave-checkpoints/migrations/02_add_history_origin_preview.up.sql` | ALTER `storyboard_history`: +`origin` ENUM DEFAULT 'legacy', +`preview_kind` ENUM NULL, +індекс `(draft_id, origin, id DESC)` — guarded INFORMATION_SCHEMA-патерн (026/029) |
| `docs/features/storyboard-autosave-checkpoints/migrations/02_add_history_origin_preview.down.sql` | Guarded DROP індексу та обох колонок у зворотному порядку |

## Promote-time hint

Репо: послідовні одно-файлові міграції `NNN_description.sql` в `apps/api/src/db/migrations/`, in-process runner (`runPendingMigrations`, checksums у `schema_migrations`, `APP_MIGRATE_ON_BOOT`). Живе дерево закінчується на `049` → **next ≈ `050` (01) та `051` (02)** — реальні номери призначає `implement` при промоції (інша фіча може промоутитись першою). SAD §5 називав ці ж номери (`050_user_settings.sql`, `051_history_origin.sql`) — збігається з очікуванням.

## Convention deviations (flagged, не silent)

1. **Живе дерево не має `.down.sql`-файлів** — конвенція репо: rollback документується в шапці міграції коментарем «Manual rollback:». Staged-пара зберігає повний `.down.sql` (вимога стадії — повна reversibility); шапка кожного `.up.sql` вже містить «Manual rollback:» у стилі репо. **При промоції:** `implement` переносить лише `.up.sql` (перейменувавши на `NNN_*.sql`); `.down.sql` лишається в фіча-теці як rollback-документація — «Manual rollback:» у шапці вже синхронізований.
2. Інших відхилень немає: ENUM для type-колонок (як 010/031), JSON-стейт + DATETIME(3) ON UPDATE (як 028), guarded ідемпотентні ALTER (як 029), `IF NOT EXISTS` на CREATE TABLE, snake_case, InnoDB utf8mb4_unicode_ci.

## Рішення, закриті на цій стадії (підтверджені власником 2026-06-05)

| Питання | Рішення |
|---|---|
| Spec §8 OQ-2: кап історії при checkpoint-only | **Лишається 50** (`HISTORY_CAP` — константа app-шару, без зміни) |
| ADR-0003: форма колонки `origin` | **ENUM('legacy','checkpoint') NOT NULL DEFAULT 'legacy'** — конвенція репо; pre-restore checkpoint-и окремого значення не отримують (за sequences: `origin=checkpoint`) |
| NFR: серверний підрахунок частки minimap-фолбеків | **Окрема колонка `preview_kind` ENUM('screenshot','minimap') NULL** — COUNT без парсингу snapshot JSON; NULL = легасі-рядок |

## Drift findings

Drift-перевірка domain-шару ↔ схема: **розбіжностей немає.**
- `StoryboardHistoryEntry` (`apps/api/src/repositories/storyboard.repository.types.ts:48`) — `id`/`draftId`/`snapshot`/`createdAt` ↔ `storyboard_history` 1:1 (типи й nullability збігаються).
- `user_settings` — нова таблиця, domain-типу ще немає (з'явиться на `implement`).
- `_drift/` не створювався — нічого виправляти.

Forward-нотатка для `implement` (не drift): `HistoryRow`/`StoryboardHistoryEntry`, `insertHistoryAndPrune` та `findHistoryByDraftId` треба розширити новими колонками `origin`/`preview_kind` (список панелі додає `WHERE origin = 'checkpoint'`).

## Breaking-change decompositions

Не знадобилися: обидві ADD COLUMN мають DEFAULT → MySQL 8 INSTANT ALTER (metadata-only, без перебудови таблиці); CREATE INDEX — INPLACE/online. Expand→backfill→contract не потрібен — жодна існуюча колонка не змінюється і не видаляється.

## Seeds

Немає (bootstrap — лінивий upsert app-шаром; lookup — Zod-константа, не таблиця). PII-guard: у тест-фікстурах лише `user-<uuid>@example.test`.

## Self-checks

| # | Check | Result |
|---|---|---|
| 1 | Naming за конвенцією репо (snake_case; `idx_storyboard_history_*`, `fk_<table>_<ref>`) | PASS |
| 2 | Down reversibility (CREATE↔DROP TABLE; 2×ADD↔2×DROP COLUMN; CREATE↔DROP INDEX) | PASS |
| 3 | FK indexes (єдиний FK `user_settings.user_id` покритий PK; `draft_id` без FK — свідомо, як у 034) | PASS |
| 4 | Convention adherence (ENUM/JSON/guards/однофайлова промоція — відхилення №1 зафлаговане вище) | PASS |

## `<!-- TBD -->`

Жодного — секція TBD у `data-model.md` порожня.

## Next stage

`api storyboard-autosave-checkpoints`
