---
status: Draft
owner: "Architect / Tech Lead"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-06-05"
feature_size: "M"
target_surfaces: [web-frontend, backend-service]  # §4 decision (ADR-0001). Read (never re-derived) by api/sequences/tasks/plan-tests/review → _shared/surfaces.md
---

# Software Architecture Document — storyboard-autosave-checkpoints

<!-- 12 Arc42 sections. Empty section → <!-- N/A: <one-line reason> -->. -->
<!-- C4 Context (L1) lives inline in §3. C4 Container (L2) lives inline in §5. -->
<!-- Numbers in §10 come VERBATIM from spec.md §6 NFR — no inventing, no rounding. -->

## 1. Introduction and goals

<!-- 🎯 Why: durable memory of «what + the three dominant qualities + who cares». A year from
     now nobody recalls which three qualities were critical for this system.
     📋 Write: 1 ¶ intent + 3 lines of top-3 quality goals + a stakeholders table.
     ¶4 is the override slot — critic `Override` resolutions emit «Decision override: <headline>
     — rationale: <reason>» bullets here so downstream skills see the deliberate choice. -->

**Intent.** Розділити збереження сторіборда (сторінка «Video Road Map») на два рівні: (i) **lightweight autosave** — як і сьогодні, зберігає стан дошки за кілька секунд після кожної зміни, але більше не створює History entries і не знімає скриншоти; (ii) **checkpoint save** — раз на налаштований Creator-ом autosave interval (пресети 30 с / 1 / 2 / 5 / 10 хв, дефолт 1 хв) або вручну кнопкою Save знімає layout screenshot і створює History entry. Каденція видима через checkpoint countdown bar у верхньому правому куті; інтервал редагується на новій сторінці Settings — першій персональній settings-поверхні продукту (ліве меню Home). Мета — знизити навантаження з «запис історії + скриншот на кожну зміну» до «щонайбільше один на інтервал», не зменшивши свіжість збережених даних.

**Top-3 quality goals (1-liners; full scenarios in §10):**

1. **Ефективність записів** — ≤ 1 History entry на autosave interval на draft (замість одного на кожну зміну сьогодні), без втрати свіжості збереженого стану.
2. **Надійність точок відновлення** — checkpoint ніколи не зникає мовчки: збій/таймаут зняття скриншота (> 5 с) понижує прев'ю до SVG-мінімапи, але запис створюється; частка фолбеків < 2 %.
3. **Відгук інтерфейсу** — full-screen loader ≤ 1 с p95; підтвердження lightweight autosave ≤ 500 мс p95; завантаження History-панелі ≤ 500 мс p95; читання налаштувань при відкритті дошки ≤ 300 мс p95.

**Stakeholders.**

| Role | Interest | Sign-off owner? |
|---|---|---|
| Creator | Редагує дошку; покладається на autosave, History та Settings | No |
| Steven Hayes (PM) | Продуктові рішення; консультується по §10 quality goals та §11 severities | No |
| Tech Lead | Затвердження SAD | Yes |
| Security Lead | Security review — обов'язковий за spec §6.1 (перший per-user settings surface) | Yes |

<!-- Decision overrides (¶4) — populated by the critic resolution loop, empty otherwise. -->

## 2. Constraints

<!-- 🎯 Why: §4 strategy only works when §2 has fixed WHAT IS ALREADY FIXED — stack, versions,
     deadline, regulatory. This is an input, not an output.
     📋 Write: four blocks — Technical / Organisational / Conventions / Regulatory.
     📌 Pin versions («<datastore> 18», not «<datastore>»); «Q3 deadline — hard», not «ideally».
     Never N/A — every feature inherits at least Conventions + Technical. -->

**Technical.**
- TypeScript 5.4+ (strict, ESM), Node ≥ 20; монорепо Turborepo + npm workspaces.
- Frontend: React 18 + Vite 5, React-Router v7, TanStack Query 5; стан — кастомний external store + `useSyncExternalStore` (без Zustand/Redux); канвас сторіборда — `@xyflow/react`.
- Backend: Express 4 + Zod-валідація; типізовані error-класи (`apps/api/src/lib/errors.ts`) з центральним хендлером.
- БД: MySQL 8 / InnoDB через `mysql2` raw SQL (без ORM); міграції — нумеровані `NNN_*.sql` (наступний номер 050), in-process runner (`APP_MIGRATE_ON_BOOT`).
- Зняття скриншота: бібліотека `html-to-image` вже в стеку (`apps/web-editor/src/features/storyboard/utils/captureCanvasThumbnail.ts` — JPEG 320×180, q0.6); виконується в браузері, на main thread.
- Існуючий save-шлях: `useStoryboardAutosave` (дебаунс 5 с) → `PUT /storyboards/:draftId`; історія: `POST /storyboards/:draftId/history` → `insertHistoryAndPrune`, кап 50 записів (`HISTORY_CAP`, `storyboard.service.ts:18`).

**Organisational.**
- Розмір фічі M (1–2 спринти); бюджет/дедлайн у специфікації не зафіксовані → `TBD by PM` (рядок у §11).
- Команда: соло-розробка з AI-агентами (SDD-пайплайн).

**Conventions.**
- `docs/architecture-rules.md` + `docs/architecture-map.md` — канонічні: api-домен = `routes → controllers → services → repositories` (без DI, singletons); web-фіча = `features/<name>/{components,hooks,api.ts,types.ts}`; UUID v4 `CHAR(36)`; `config.ts` — єдине місце читання env (`APP_*`); стилі — co-located `*.styles.ts` (inline `CSSProperties`, без Tailwind); тести Vitest co-located, інтеграційні — на живому MySQL (`singleFork`); E2E — Playwright.
- Нових зовнішніх залежностей фіча не додає.

**Regulatory / external.**
- Класифікація даних: internal — board snapshot-и та layout screenshot-и містять контент Creator-а (spec §6.1); нова преференція (autosave interval) — несенситивна.
- Security review обов'язковий (spec §6.1): перший per-user settings surface; ownership-правила drafts/history переносяться на нові поверхні (settings читає/пише лише власник акаунта).

## 3. Context and scope

<!-- 🎯 Why: draws the SYSTEM BOUNDARY — who talks to it from outside, where the trust zone ends.
     Without §3, §5 and §8 (authorization) blur — unclear what's «inside» vs «outside».
     📋 Write: 2–3 sentences of business context + an external-systems table + a C4Context block.
     📌 «External: none (deliberate, no third-party in v1)» is itself a decision worth stating.
     Trust boundary — the line past which you don't trust data without checking it.
     Never N/A — greenfield still draws the planned actors + external systems. -->

Creator редагує свій storyboard draft на сторінці дошки ClipTale. Система безперервно зберігає поточний стан (lightweight autosave), періодично — за autosave interval або вручну — створює візуальні точки відновлення (checkpoint save → History entry зі layout screenshot), і дає Creator-у керувати каденцією через сторінку Settings. Уся фіча живе всередині існуючої системи ClipTale (web-editor SPA + api + MySQL); довірча межа — автентифікований акаунт: draft, його History та налаштування доступні лише власнику.

<!-- brownfield: existing save path useStoryboardAutosave (5s debounce) → PUT /storyboards/:draftId; history POST /storyboards/:draftId/history with 50-cap prune; screenshot via html-to-image in-browser; no per-user settings surface yet (HomeSidebar has 3 nav items); scan 2026-06-05 -->

**External systems (in / out):**

| Actor or system | Type | Interaction |
|---|---|---|
| Creator | Person | Редагує дошку; отримує autosave + checkpoint-и; керує autosave interval у Settings; виконує Restore |
| Non-owner (signed-in user, не власник draft) | Person (external to trust zone) | Будь-який доступ до чужого draft, History чи налаштувань — відмова |
| Зовнішні сервіси | — | **Немає (свідомо):** зняття скриншота виконується в браузері (`html-to-image`), збереження — в існуючу MySQL; жодних third-party інтеграцій у v1 |

**C4 Context (L1):**

```mermaid
C4Context
    title storyboard-autosave-checkpoints — System Context

    Person(creator, "Creator", "Власник storyboard draft: редагує дошку, відновлює стани, налаштовує autosave interval")
    Person_Ext(nonowner, "Non-owner user", "Автентифікований користувач без прав на цей draft")
    System(cliptale, "ClipTale", "AI-відеоредактор: дошка сторіборда з двома рівнями збереження, History-панель, Settings")

    Rel(creator, cliptale, "Редагує дошку; autosave + checkpoints; Restore; змінює інтервал", "HTTPS")
    Rel(nonowner, cliptale, "Спроба доступу до чужого draft/History/settings — відмова", "HTTPS")
```

## 4. Solution strategy

<!-- 🎯 Why: the 3–4 STRATEGIC PILLARS every ADR grows from. Without §4 each ADR looks random —
     there's no umbrella. ⭐ The densest section — the blast-radius gate fires almost always here
     (decisions are irreversible + multi-module).
     📋 Write: 3–4 choices; each a heading + 2–3 sentences of rationale.
     📌 «Store content as a table of typed blocks» is a pillar — ADR-0001 grows from it. -->

**Top strategic choices (the seeds for ADRs):**

1. **Цільові поверхні: `web-frontend` + `backend-service` (ADR-0001).** Фіча наскрізна: браузерна частина (розділені хуки збереження, countdown bar, full-screen loader, фільтрована History-панель, Settings-сторінка) + бекенд (settings-ендпоінти, маркер/фільтр історії, міграції). Воркери не задіяні — скриншот можливий лише в живому DOM. *UI-архітектура для web-frontend — без окремого рішення: репозиторій уже зафіксував SPA (React 18 + Vite, §2); альтернатив, не виключених констрейнтами, немає → інлайн-нотатка, без ADR. Нові екрани компонуються з наявних shared-компонентів і `*.styles.ts`-підходу (карта архітектури, §Frontend).*
2. **Клієнтський планувальник checkpoint-ів (ADR-0002).** Браузер володіє всім розкладом: countdown-таймер, деферал під час drag/typing (кап — один додатковий інтервал), обробка `visibilitychange` (прострочений checkpoint ≤ 10 с після повернення, AC-03c), pre-restore checkpoint. Бекенд — тонкий CRUD із валідацією. Причина: layout screenshot знімається лише з живого DOM (`html-to-image`); сервер фізично не має джерела зображення. Скриншот + снапшот ідуть одним запитом — атомарність живить quality goal №2. **Мульти-таб / мульти-девайс: last-writer-wins, як сьогодні** (закриває spec §8 OQ-1; рідкісний режим двох активних вкладок може дати до 2 checkpoint-ів на інтервал — ризик-рядок у §11).
3. **Явний маркер походження History entry (ADR-0003).** Колонка `origin` у `storyboard_history` (легасі-дефолт для існуючих рядків; нові checkpoint-и — `'checkpoint'`); History-панель і API фільтрують легасі на рівні SQL (AC-08), частка minimap-фолбеків рахується серверним запитом (NFR). Деталі колонки/індексу — на етапі `data-model`.
4. **Узагальнене сховище налаштувань користувача (ADR-0004).** Нова таблиця `user_settings` (user_id PK + JSON + updated_at) за прецедентом `user_project_ui_state`, але per-account. Autosave interval — перше поле; майбутні преференції додаються без міграцій (spec Goal 3 «scaffolding first»). Валідація білого списку пресетів (30/60/120/300/600 с) — Zod в app-шарі, як скрізь у репозиторії.
5. **Layout screenshot — інлайн data-URL у snapshot JSON (ADR-0005).** Як сьогодні: JPEG 320×180 (~15–25 КБ) усередині JSON-колонки; один POST = запис + прев'ю атомарно, нуль нової інфраструктури. S3-винесення відхилено для v1: двофазний запис створює режими збоїв, що суперечать quality goal №2 («checkpoint ніколи не зникає мовчки»).

Each tactical decision in later sections should trace to one of these seeds. Tactical decisions that *contradict* a strategic choice are red flags — surface them in §11.

## 5. Building block view

<!-- 🎯 Why: INTERNAL DECOMPOSITION — modules, containers, datastores. The static topology: who
     may talk to whom. Without §5, §6 (the flows) has no vocabulary of participants.
     📋 Write: 1 ¶ on the style (layered / hexagonal / clean / event-driven) + a folder tree + a
     C4Container block.
     📌 Draw ONE Container per declared `target_surface` (frontmatter): a fullstack
     [backend-service, web-frontend] = a backend-API container + a web/SPA container; a
     [backend-service, mobile-app] = the API + the mobile app. The Container(web, …) line below is
     just one surface's container — swap/add per what was declared in §4. → _shared/surfaces.md
     📌 e.g. «web app, content API, media worker, datastore, object store, CDN». -->

Шаруватість успадкована від репозиторію (без нових стилів): фронтенд — фіча-модулі `features/<name>/{components,hooks,api.ts,types.ts}` зі станом у хуках/external store; бекенд — ланцюг `routes → controllers → services → repositories` із прямими singleton-імпортами. Фіча **розширює** модуль `features/storyboard/` (нові хуки/компоненти збереження), **додає** новий фіча-модуль `features/settings/` (Settings-сторінка) і новий бекенд-домен `settings` (окремий ланцюг, не вштовхнутий у storyboard-домен — інший життєвий цикл і інша таблиця).

**Internal decomposition:**

```
apps/web-editor/src/features/
├── storyboard/                                  (розширюється)
│   ├── hooks/useStoryboardAutosave.ts           без змін — lightweight autosave, дебаунс 5 с
│   ├── hooks/useCheckpointScheduler.ts          НОВИЙ — countdown-таймер, деферал drag/typing,
│   │                                            visibility-обробка, прострочений запуск, double-save guard
│   ├── hooks/useStoryboardHistoryPush.ts        стає checkpoint-push: скриншот + снапшот одним запитом
│   ├── components/CheckpointCountdownBar.tsx    НОВИЙ — countdown bar + кнопка Save (idle-стан «all saved»)
│   ├── components/CheckpointCaptureOverlay.tsx  НОВИЙ — full-screen loader на час зняття
│   ├── components/StoryboardHistoryPanel.tsx    фільтр «лише checkpoint-и»; pre-restore checkpoint перед Restore
│   └── utils/captureCanvasThumbnail.ts          + 5-с таймаут → minimap-фолбек (AC-04)
└── settings/                                    НОВИЙ фіча-модуль
    ├── components/SettingsPage.tsx              пресети інтервалу; помилки збереження/читання (AC-11, AC-11b)
    ├── api.ts                                   читання/запис налаштувань через apiClient
    └── types.ts
    (+ пункт Settings у features/home/components/HomeSidebar.tsx)

apps/api/src/
├── routes/settings.routes.ts                    НОВИЙ ланцюг — читання/запис налаштувань власника
├── controllers/settings.controller.ts
├── services/settings.service.ts
├── repositories/settings.repository.ts
├── routes|controllers|services/storyboard.*     розширення: origin-маркер при записі, фільтр легасі в списку
└── db/migrations/                               050_user_settings.sql + 051_history_origin.sql (точна форма — data-model)
```

**C4 Container (L2):**

```mermaid
C4Container
    title storyboard-autosave-checkpoints — Containers

    Person(creator, "Creator", "Власник storyboard draft")

    Container_Boundary(cliptale, "ClipTale") {
        Container(web, "web-editor", "React 18 SPA + @xyflow/react", "Дошка сторіборда: lightweight autosave, клієнтський checkpoint-планувальник зі скриншотом, countdown bar, History-панель, Settings-сторінка")
        Container(api, "api", "Express 4 + Zod", "Збереження дошки, History CRUD з origin-фільтром, налаштування користувача; ownership-перевірки")
    }

    ContainerDb(mysql, "MySQL 8", "InnoDB", "storyboard_history (+origin, скриншот у snapshot JSON), user_settings, drafts")

    Rel(creator, web, "Редагує дошку; Save; Restore; змінює інтервал", "HTTPS")
    Rel(web, api, "Lightweight save / checkpoint push / список History / читання-запис налаштувань", "JSON/HTTPS")
    Rel(api, mysql, "Читає/пише снапшоти, History, налаштування", "mysql2 raw SQL")
```

## 6. Runtime view

<!-- 🎯 Why: the RUNTIME FLOW of 1–2 critical scenarios — who talks to whom, when, in what order.
     Without §6, §5 is just boxes with no life.
     📋 Write: a Mermaid sequenceDiagram. Participants are names from §5 (don't invent new ones).
     Messages are semantic («saves a draft»), NO HTTP verbs / paths / status codes — endpoint-level
     sequences arrive at the `api` stage.
     📌 e.g. «author → web: composes draft → web → content API: save». Seed the primary flow(s) here;
     the `sequences` stage then covers every §5 AC (no cap). Never N/A for M+; XS/S keeps ≥1 happy-path flow. -->

### Lightweight autosave з автоматичним повтором (US-01)

```mermaid
sequenceDiagram
    autonumber
    actor U as <user>
    participant UI as <ui>
    participant S as <service>
    participant D as <data-store>

    Note over U,UI: Precondition: Creator редагує власний draft на сторінці дошки
    U->>UI: змінює дошку (додає, рухає, редагує чи видаляє блок або звʼязок)
    UI->>UI: дебаунс — кілька секунд після останньої зміни (сьогоднішній таймінг)
    UI->>S: lightweight-збереження поточного стану дошки (без скриншота)
    S->>S: перевіряє, що запитувач — власник draft-а
    alt збереження вдалося
        S->>D: оновлює поточний стан дошки
        Note over S,D: persists board snapshot — лише поточний стан, History entry не створюється (AC-02)
        D-->>S: ok
        S-->>UI: збереження підтверджено
        UI-->>U: індикатор у топ-барі показує «Saved»
    else збій збереження, наприклад проблема зі звʼязком (AC-01b)
        S--xUI: збереження не вдалося
        UI-->>U: індикатор показує «останні зміни не збережені», редагування не блокується
        loop автоматичні повтори, доки збереження не вдасться
            UI->>S: повторює lightweight-збереження поточного стану
        end
        S-->>UI: збереження підтверджено
        UI-->>U: індикатор повертається у «Saved»
    end
    Note over U,UI: Postcondition: поточний стан збережено, список History незмінний (AC-02)
```

**Critical flow 1: автоматичний checkpoint за інтервалом (з дефералом і фолбеком зняття)**

```mermaid
sequenceDiagram
    actor Creator
    participant Web as web-editor
    participant Api as api
    participant DB as MySQL

    Note over Web: autosave interval сплив і є зміни, новіші за останній checkpoint
    opt Creator тягне блок або друкує на канвасі
        Web->>Web: відкладає checkpoint до кінця взаємодії (кап — один додатковий інтервал)
    end
    Web-->>Creator: показує full-screen loader
    Web->>Web: знімає layout screenshot живого канваса (таймаут 5 с)
    alt зняття вдалося
        Web->>Api: checkpoint — снапшот дошки + скриншот
    else збій або таймаут зняття
        Web->>Api: checkpoint — снапшот без скриншота (прев'ю — SVG-мінімапа)
    end
    Api->>Api: перевіряє, що запитувач — власник draft-а
    Api->>DB: вставляє History entry (походження: checkpoint) і чистить понад кап
    DB-->>Api: ok
    Api-->>Web: запис створено
    Web-->>Creator: ховає loader, новий запис зверху History, countdown перезапущено
```

### Прострочений checkpoint при поверненні вкладки або відкритті draft-а (US-02)

```mermaid
sequenceDiagram
    autonumber
    actor U as <user>
    participant UI as <ui>
    participant S as <service>
    participant D as <data-store>

    Note over U,UI: Precondition: зміни, новіші за останній checkpoint, чекають довше за autosave interval (вкладка була у фоні або draft щойно відкрито)
    U->>UI: повертається на вкладку дошки або відкриває draft
    UI->>UI: виявляє прострочені зміни — час очікування перевищив інтервал
    Note over UI: один прострочений checkpoint запускається протягом 10 секунд (AC-03c)
    UI-->>U: показує full-screen loader
    UI->>UI: знімає layout screenshot живого канваса (фолбек на мінімапу за правилом AC-04)
    UI->>S: checkpoint — снапшот дошки + скриншот
    S->>S: перевіряє, що запитувач — власник draft-а
    S->>D: вставляє History entry з походженням checkpoint і чистить понад кап
    Note over S,D: persists history entry (origin=checkpoint, скриншот усередині snapshot JSON)
    D-->>S: ok
    S-->>UI: запис створено
    UI-->>U: ховає loader, звичайний countdown відновлюється
    Note over U,UI: Postcondition: рівно один прострочений checkpoint виконано, регулярний відлік триває далі
```

### Життєвий цикл countdown: idle-стан і старт відліку (US-03)

```mermaid
sequenceDiagram
    autonumber
    actor U as <user>
    participant UI as <ui>

    Note over U,UI: Precondition: дошку відкрито, останній checkpoint уже зафіксував усі зміни
    Note over UI: countdown bar показує idle-стан «all saved», кнопка Save неактивна (AC-05)
    opt autosave interval спливає без жодної зміни
        UI->>UI: не створює checkpoint — жодного нового History entry (AC-05)
    end
    U->>UI: робить першу зміну після idle-стану
    UI->>UI: запускає свіжий повний відлік інтервалу (AC-06)
    UI-->>U: countdown bar у верхньому правому куті рахує до наступного автоматичного checkpoint-а
    Note over UI: після кожного checkpoint-а — автоматичного чи ручного — відлік скидається наново (AC-06)
    alt на момент закінчення відліку є нові зміни
        UI->>UI: запускає автоматичний checkpoint (див. потік автоматичного checkpoint-а вище)
    else змін немає
        UI-->>U: повертається в idle-стан «all saved», кнопка Save знову неактивна
    end
    Note over U,UI: Postcondition: відлік іде лише коли є незафіксовані в History зміни, дублікат незмінного стану неможливий
```

### Ручний Save: негайний checkpoint без дефералу (US-04)

```mermaid
sequenceDiagram
    autonumber
    actor U as <user>
    participant UI as <ui>
    participant S as <service>
    participant D as <data-store>

    Note over U,UI: Precondition: є зміни, новіші за останній checkpoint (інакше Save неактивна — AC-05)
    U->>UI: натискає кнопку Save поруч із countdown bar
    alt checkpoint уже виконується (AC-07b)
        UI-->>U: кнопка Save неактивна до завершення поточного checkpoint-а — другий паралельний не стартує
    else checkpoint не виконується
        Note over UI: деферал AC-03b не застосовується — ручний Save запускається одразу, навіть під час drag чи набору тексту
        UI-->>U: показує full-screen loader
        UI->>UI: знімає layout screenshot живого канваса (фолбек на мінімапу за правилом AC-04)
        UI->>S: checkpoint — снапшот дошки + скриншот
        S->>S: перевіряє, що запитувач — власник draft-а
        S->>D: вставляє History entry з походженням checkpoint і чистить понад кап
        Note over S,D: persists history entry (origin=checkpoint, скриншот усередині snapshot JSON)
        D-->>S: ok
        S-->>UI: запис створено
        UI-->>U: ховає loader, новий запис зі скриншотом зверху History, відлік інтервалу перезапущено
    end
    Note over U,UI: Postcondition: щонайбільше один checkpoint у польоті, відлік скинуто після успішного Save
```

### Відкриття History-панелі: лише checkpoint-и, відмова не-власнику (US-05)

```mermaid
sequenceDiagram
    autonumber
    actor U as <user>
    participant UI as <ui>
    participant S as <service>
    participant D as <data-store>

    Note over U,UI: Precondition: draft має і легасі-записи (створені до фічі), і нові checkpoint-записи
    U->>UI: відкриває сторінку дошки та History-панель draft-а
    UI->>S: запитує список History entries draft-а
    alt запитувач — власник draft-а
        S->>D: читає лише записи з походженням checkpoint, новіші зверху
        Note over S,D: фільтр легасі — на рівні запиту до сховища (AC-08), легасі-записи не видаляються
        D-->>S: сторінка checkpoint-записів
        S-->>UI: список checkpoint-записів
        UI-->>U: панель показує лише checkpoint-и, кожен із превʼю та контролем Restore
    else запитувач не є власником draft-а (AC-13)
        S--xUI: відмова в доступі — draft, його збереження та History доступні лише власнику
        UI-->>U: повідомлення про відсутність доступу
    end
    Note over U,UI: Postcondition: не-власник не бачить ані дошки, ані History, легасі-записи приховані, не знищені
```

### Зміна autosave interval на сторінці Settings (US-06)

```mermaid
sequenceDiagram
    autonumber
    actor U as <user>
    participant UI as <ui>
    participant S as <service>
    participant D as <data-store>

    Note over U,UI: Precondition: Creator увійшов в акаунт і відкрив Settings із лівого меню Home
    U->>UI: обирає інший пресет інтервалу (30 с, 1, 2, 5 або 10 хв)
    UI->>S: зберігає autosave interval акаунта
    S->>S: валідує інтервал за білим списком пресетів
    alt запитувач — власник акаунта і запис вдався
        S->>D: записує налаштування акаунта
        Note over S,D: persists user settings (один рядок на користувача, autosave interval усередині)
        D-->>S: ok
        S-->>UI: збережено
        UI-->>U: підтвердження зміни — новий інтервал діятиме з наступного старту відліку (AC-09)
        Note over UI: відлік, що вже йде на відкритій дошці, дораховує за старою каденцією (AC-09)
    else спроба читати чи змінювати налаштування чужого акаунта (AC-11c)
        S--xUI: відмова — налаштування читає й пише лише власник акаунта
    else запис не вдався, наприклад проблема зі звʼязком (AC-11)
        S--xUI: зміну не збережено
        UI-->>U: повідомлення про незбережену зміну, далі показується попередній збережений інтервал
    end
    Note over U,UI: Postcondition: збережений інтервал змінюється лише після підтвердженого запису власником
```

### Читання autosave interval при відкритті дошки (US-06)

```mermaid
sequenceDiagram
    autonumber
    actor U as <user>
    participant UI as <ui>
    participant S as <service>
    participant D as <data-store>

    Note over U,UI: Precondition: Creator увійшов в акаунт — на будь-якому браузері чи пристрої
    U->>UI: відкриває свій storyboard draft на сторінці дошки
    UI->>S: читає налаштування акаунта
    S->>S: перевіряє, що запитувач — власник акаунта
    alt налаштування прочитано
        S->>D: читає збережений autosave interval
        D-->>S: збережене значення або порожньо (користувач ще нічого не налаштовував)
        S-->>UI: інтервал акаунта (або дефолт 1 хв, якщо запису ще немає)
        UI->>UI: планувальник checkpoint-ів стартує з інтервалом акаунта
        Note over UI: інтервал іде за акаунтом, не за браузером — інший пристрій бачить оновлене значення (AC-10)
    else налаштування не вдалося прочитати (AC-11b)
        S--xUI: збій читання
        UI->>UI: планувальник стартує з дефолтним інтервалом 1 хв на цю сесію
        UI-->>U: редагування не блокується
    end
    Note over U,UI: Postcondition: countdown завжди має чинний інтервал — збережений, дефолт за відсутності запису або сесійний дефолт при збої
```

**Critical flow 2: безпечний Restore із pre-restore checkpoint-ом (AC-12)**

```mermaid
sequenceDiagram
    actor Creator
    participant Web as web-editor
    participant Api as api
    participant DB as MySQL

    Creator->>Web: підтверджує Restore старішого History entry
    opt є зміни, новіші за останній History entry
        Web->>Web: знімає скриншот поточного стану (з фолбеком на мінімапу, ніколи не блокує Restore)
        Web->>Api: pre-restore checkpoint поточного стану
        Api->>DB: вставляє History entry (походження: checkpoint)
        DB-->>Api: ok
        Api-->>Web: запис створено
    end
    Web->>Web: застосовує снапшот обраного запису на канвас
    Web->>Api: lightweight-збереження відновленого стану
    Api->>DB: оновлює поточний стан дошки
    Web-->>Creator: дошка у відновленому стані, pre-restore запис зверху History
```

**Sequences-stage notes (2026-06-05):**
- Нові потоки (7) використовують генеричний словник стадії sequences; відповідність §5: `<ui>` = web-editor, `<service>` = api, `<data-store>` = MySQL. Нових учасників, не оголошених у §5, не зʼявилося; `<message-bus>` не потрібен — усі потоки синхронні (скриншот можливий лише в живому DOM, ADR-0002).
- Persist-підказки для `data-model`: (i) lightweight autosave — оновлення поточного стану draft-а без History; (ii) checkpoint/pre-restore — вставка History entry з origin=checkpoint + прюнінг понад кап → читання History фільтрується за draft + походження + час (новіші зверху, AC-08); (iii) user settings — один рядок на користувача, autosave interval усередині (ADR-0004).
- Edits-log: у двох потоках, намальованих на стадії design («Critical flow 1/2»), виправлено лише синтаксис — `;` у тексті повідомлень замінено на коми (`;` ламає парсинг Mermaid); семантика не змінювалася.
- Рендерера Mermaid у репозиторії немає — валідація структурним лінтом; рекомендовано `npx -y @mermaid-js/mermaid-cli` для повного парс-чеку.

## 7. Deployment view

<!-- 🎯 Why: the TOPOLOGY DevOps must know without reading the deploy charts — how many replicas,
     where the background worker lives, AT WHAT NUMBERS we scale.
     📋 Write: 2–3 sentences on topology + monitoring + concrete threshold numbers.
     📌 e.g. «500 authors → partition by quarter» (not «we'll think about scale later»).
     🎯 N/A allowed for XS/S that reuses an existing deployment unit with no change.
     Deployment-diagram scaffold → templates/deployment.md. -->

Нових деплой-юнітів немає: фіча живе в існуючих контейнерах web-editor і api та існуючій MySQL (docker compose / prod-топологія без змін). Міграції `050`/`051` котяться існуючим in-process runner-ом при старті api (`APP_MIGRATE_ON_BOOT`) — швидкі ALTER/CREATE без даунтайму. Навантаження падає, а не росте: записи історії — з per-change до per-interval; `user_settings` — один рядок на користувача.

**Monitoring:**
- History row-creation rate до/після релізу (KPI-1; базлайн — тижневий підрахунок до release-гілки) — SQL-підрахунок по `storyboard_history`.
- Частка minimap-фолбеків — серверний запит по checkpoint-записах без скриншота; ціль NFR < 2 %.
- Латентності lightweight save / history list / settings read — з API request logs (браузерної телеметрії в проді немає — свідомо; loader-таймінги вимірюються e2e в CI).

**Scaling thresholds:**
- Кап 50 записів обмежує історію ≤ ~1.5 МБ на draft (ADR-0005) — комфортно в одній таблиці без партиціювання.
- Перегляд потрібен лише якщо кап виросте на порядок або прев'ю стануть full-size — тоді переглядається ADR-0005 (S3-винесення).

## 8. Crosscutting concepts

<!-- 🎯 Why: CROSS-CUTTING PATTERNS spanning several modules: logging, errors, authorization, ID
     strategy, events, caching. ⭐ The second-densest section. A pattern inside one module is NOT
     here; a project-wide convention belongs in the convention file.
     📋 Write: a table — concept / convention / where defined. One row per concept.
     📌 e.g. «sortable time-based IDs generated in the app layer» as a default from the convention file. -->

Повне успадкування дефолтів репозиторію, нуль override-ів. Фіча-специфічні лише: білий список пресетів інтервалу в Zod (ADR-0004) і правило «settings читає/пише лише власник акаунта» (spec AC-11c).

| Concept | Convention | Where defined |
|---|---|---|
| Logging | console + структуровані API request logs (джерело NFR-вимірів) | конвенції api |
| Authentication | існуючий `authMiddleware` (токен) на всіх нових маршрутах | `apps/api/src/middleware` |
| Authorization | `aclMiddleware('editor')` + ownership-перевірка в service-шарі (`req.user.userId`); settings — лише власник акаунта | карта архітектури §Conventions; spec AC-11c/AC-13 |
| Error handling | типізовані error-класи → центральний хендлер → JSON; фронт: autosave-ретрай + індикатор «не збережено» (AC-01b), settings — повідомлення без блокування редагування (AC-11/AC-11b) | `apps/api/src/lib/errors.ts` |
| Validation | Zod на кожному body; інтервал — білий список пресетів 30/60/120/300/600 с | конвенція api + ADR-0004 |
| ID strategy | UUID v4 `CHAR(36)` для нових сутностей; `storyboard_history` лишається на існуючому AUTO_INCREMENT | карта архітектури |
| Internationalisation | N/A — продукт одномовний | — |
| Observability | API request logs; loader-таймінги — e2e в CI (без браузерної телеметрії в проді) | spec §6 |
| Events / async | N/A — фіча не торкається BullMQ/Redis | — |
| Server-state кеш (фронт) | TanStack Query: ключі history list і settings; інвалідація після checkpoint-а / запису налаштувань | конвенція web-editor |

## 9. Architecture decisions

<!-- 🎯 Why: the REVERSE INDEX onto the adr/ folder. `ls adr/` gives the files; §9 gives the
     semantics — why they exist, which SAD section they attach to, what status.
     📋 Write: a 4-column table, one row per ADR. Mixed status is fine.
     📌 e.g. «0001 | Store content as a table of typed blocks | Accepted | §4». -->

| # | Title | Status | Section |
|---|---|---|---|
| 0001 | Deliver the feature across web-frontend and backend-service surfaces | Accepted | §4 |
| 0002 | Run the checkpoint scheduler in the browser client | Accepted | §4 |
| 0003 | Mark checkpoint history rows with an origin column | Accepted | §4 |
| 0004 | Store per-user preferences in a user_settings JSON table | Accepted | §4 |
| 0005 | Keep layout screenshots as inline data-URLs in the snapshot JSON | Accepted | §4 |

ADR files live under `docs/features/storyboard-autosave-checkpoints/adr/NNNN-<title>.md`.

## 10. Quality requirements

<!-- 🎯 Why: the QUALITY TREE — take a goal from §1 and break it into concrete leaves: tests,
     metrics, configs, drills. ⭐ Without §10, §1 is a manifesto. With §10 each declaration maps
     to something PROVABLE.
     📋 Write: per §1 goal — When / Then / How-verify. Numbers from spec §6 NFR VERBATIM (don't
     round ≤250ms to ≤300ms — that's a critic F6 hit).
     📌 e.g. «p95 ≤ 500 ms on a block update, verified by a 100 req/s load test». -->

Each top-3 goal from §1 expanded into a full scenario (числа — дослівно зі spec §6 NFR):

**QG-1. Ефективність записів**
- **When:** Creator робить кілька змін на дошці в межах одного autosave interval.
- **Then:** створюється ≤ 1 History entry на autosave interval на draft (проти одного на кожну зміну сьогодні); підтвердження lightweight autosave сервером ≤ 500 мс p95; свіжість збереженого стану не гірша за сьогоднішню.
- **How verify:** порівняння history-table row-creation rate до/після релізу (тижневий базлайн KPI-1); інтеграційний тест «N змін в одному інтервалі → рівно 1 checkpoint-запис»; API request logs.

**QG-2. Надійність точок відновлення**
- **When:** зняття layout screenshot збоїть або не завершується за 5 с (таймаут).
- **Then:** loader знімається, checkpoint завершується, History entry створюється з minimap-прев'ю — запис ніколи не губиться мовчки; частка фолбек-записів < 2 % checkpoint-записів.
- **How verify:** e2e-тест із примусово повільним зняттям (форсує таймаут → перевіряє мінімапу); серверний SQL-підрахунок частки checkpoint-записів без скриншота.

**QG-3. Відгук інтерфейсу**
- **When:** виконується checkpoint capture (автоматичний чи ручний); Creator відкриває History-панель; Creator відкриває сторінку дошки.
- **Then:** full-screen loader видимий ≤ 1 с p95; History panel load ≤ 500 мс p95; settings read при відкритті дошки ≤ 300 мс p95.
- **How verify:** e2e-таймінги в CI + ручні spot-check-и (loader — браузерної телеметрії в проді немає); API request logs (panel load, settings read).

## 11. Risks and technical debt

<!-- 🎯 Why: ⭐ collects EVERYTHING that can break — not only the technical. Without §11 risks get
     discussed at standups and lost; debt lives only in the head of whoever accepted it.
     📋 Write: a risk/debt table — severity — mitigation — owner. Accepted debt in its own block.
     📌 The first risk is often a product risk, not a technical one. That's normal. -->

<!-- Severity literals: Low / Medium / High for regular risks; "Open question" for rows created by
     a Save-as-OQ resolution during the Socratic walk (see references/socratic.md). -->

| Risk / debt | Severity | Mitigation | Owner |
|---|---|---|---|
| Дві активні вкладки одного draft → до 2 checkpoint-ів/інтервал; lightweight-перезапис last-writer-wins (закритий spec §8 OQ-1) | Low | прийнято в ADR-0002; при скаргах користувачів — stale-tab guard окремим ADR | Steven Hayes (PM) |
| `html-to-image` знімає на main thread: джанк/повільне зняття на великих дошках | Medium | full-screen loader ховає джанк; 5-с таймаут → мінімапа (AC-04); e2e slow-capture тест | Tech Lead |
| Сьогоднішній history-push — fire-and-forget (помилка лише в console); checkpoint-push має стати надійним (quality goal №2) | Medium | ретрай + видимий стан помилки checkpoint-а; інтеграційний тест на збій push-у | Tech Lead |
| Розширення prune-логіки: mysql2 не біндить LIMIT параметром — успадкувати існуючий text-protocol обхід | Low | відомий патерн у `storyboard.repository.ts` (`insertHistoryAndPrune`) | Tech Lead |
| Бюджет/дедлайн фічі не зафіксовані (§2 Organisational) | Low | підтвердити перед `sdd:tasks` | Steven Hayes (PM) |
| ~~Open architectural decision: кап історії лишається 50 при checkpoint-only записах?~~ Закрито 2026-06-05 (data-model): кап лишається 50, `HISTORY_CAP` без змін | Low | рішення власника на стадії data-model; перегляд лише разом з ADR-0005 (розмір історії) | Steven Hayes (PM) |
| ~~Open architectural decision: хто і як знімає тижневий базлайн KPI-1 (history writes) до релізу~~ Закрито 2026-06-05 (implement T16): dev зняв тижневий підрахунок — див. `_audit/kpi1-baseline.md` | Low | повторити той самий SQL на проді перед release-гілкою | Tech Lead |

**Accepted debt (acceptable in v1, plan to fix later):**
- Легасі-рядки історії лишаються в сховищі назавжди (лише приховані з панелі; старіють через існуючий prune) — за spec Non-goal, чищення не плануємо.
- Браузерної телеметрії в проді немає — loader-NFR вимірюється e2e в CI + ручними spot-check-ами, не реальними користувачами.
- Новий інтервал застосовується з наступного countdown, не миттєво (AC-09) — прийнята простота.

## 12. Glossary

<!-- 🎯 Why: ⭐ the DOMAIN GLOSSARY that ends arguments a year later («checkpoint — weekly or
     biweekly? quarter — calendar or fiscal?»).
     📋 Write: a term / meaning table. Business + technical terms mixed.
     📌 e.g. «Lesson | a unit inside a course made of blocks (text, video)». -->

Канонічне джерело — [CONTEXT.md](./CONTEXT.md); тут — терміни, вжиті в тілі SAD.

| Term | Meaning |
|---|---|
| Lightweight autosave | Автоматичне збереження поточного стану дошки після будь-якої зміни, без скриншота й без History entry (NOT checkpoint save). |
| Checkpoint save | Збереження зі знятим layout screenshot, що створює History entry; автоматично за autosave interval або вручну кнопкою Save. |
| Autosave interval | Обраний Creator-ом проміжок між автоматичними checkpoint-ами (пресети 30 с / 1 / 2 / 5 / 10 хв, дефолт 1 хв); зберігається per-account (NOT дебаунс lightweight autosave). |
| History entry | Снапшот стану дошки від checkpoint save; відображається в History-панелі з прев'ю; ціль Restore. |
| Layout screenshot | JPEG-зображення канваса (320×180), зняте в момент checkpoint save; прев'ю History entry (NOT SVG-мінімапа — та лише аварійний фолбек). |
| Checkpoint countdown bar | Індикатор у верхньому правому куті дошки: час до наступного автоматичного checkpoint-а + кнопка Save (NOT індикатор «Saving…/Saved»). |
| Save indicator | Існуючий статус «Saving…/Saved» lightweight autosave у верхній панелі. |
| Origin (маркер) | Колонка в `storyboard_history`, що відрізняє checkpoint-записи від легасі (ADR-0003); панель показує лише checkpoint-и. |
| Creator | Автентифікований власник storyboard draft — єдина діюча роль фічі. |
| Storyboard draft | Документ, який Creator будує в generate-wizard: план сцен, блоки, ілюстрації, музика. |
| «Checkpoint ніколи не губиться мовчки» | Інваріант: збій/таймаут зняття скриншота понижує прев'ю до мінімапи, але History entry створюється завжди. |
