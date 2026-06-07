---
status: Draft
owner: "QA + implementing engineer"
reviewers: ["Implementing engineer", "Tech Lead"]
updated_at: "2026-06-07"
feature_size: "L"
---

# Test plan — storyboard-reference-flows

Каст-екстракція пропонує персонажів/оточення скрипта; Creator підтверджує каст одним колективним кост-підтвердженням; кожен запис стає reference-блоком на Video Road Map canvas, лінкованим 1:1 з авто-створеним reference flow (перші генерації — rolling window у cast order, ліміт N, дефолт 4); зірки Creator-а визначають кандидатів блока (primary star = превʼю); star gate не пускає генерацію повного набору сцен без зірок; scene generation master бере референси строго в межах reference boundary. Цей план мапить кожен acceptance criterion spec.md §5 (AC-01 … AC-14b, 18 шт.) на ≥1 іменований тест.

> Похідний від `spec.md` §5/§6, `sad.md` §6 (Flows 1–10) + `target_surfaces: [backend-service, web-frontend, worker]` + F1-override (§1: зірки — безверсійні атомарні toggle; versioned-save лише для scene links), `data-model.md` (4 таблиці + фабрики-фікстури), `contracts/openapi.yaml` + `events.md`. `implement` читає цю мапу і пише red-тести за нею — рівні він не передумує. Рівні підтверджені власником 2026-06-07 (групи 1–4 — прийнято як запропоновано; visual-regression — доданий рядок за рішенням власника).

## Levels

UI-рівні (component / visual-regression / e2e-through-UI) застосовні, бо `sad.md` оголошує `target_surfaces` із `web-frontend`. Конкретний runner/інструмент на кожен рівень `implement` бере з того, що вже використовує репо.

| Level | Scope | Strategy (generic — без імен інструментів) |
|---|---|---|
| Unit | Чиста логіка без I/O: правило обрізання касту до ліміту за scene-appearance count, fallback-правило превʼю блока, правило star gate (повний набір + scoped для однієї сцени), правило вибору reference-кандидатів (primary + добір до capacity, ADR-0008), fallback derived style на скрипт. | In-memory, без зовнішніх залежностей. |
| Integration | Сервіси/репозиторії `api` + шлях `media-worker` проти реальної MySQL, якою вони володіють: job-и екстракції, транзакція підтвердження (блоки+флоу 1:1), rolling window (атомарний claim), зірки (унікальні індекси), versioned-save scene links, каскади лайфциклу, owner-scoping. | Існуюча реальна MySQL-обвʼязка репо (тести одного файла — послідовно в одному процесі, щоб не топтати спільну БД); очищення пер-тест. НЕ мокнута база. |
| Contract | Межі `web ↔ api` (13 REST-шляхів reference-поверхні проти `contracts/openapi.yaml`) і `api ↔ media-worker` (payload-и подій/job-ів проти `contracts/events.md` та їхніх схем). | Валідація реальних request/response + payload проти узгодженого контракту; без hand-rolled стабів. |
| Component | UI-шматок ізольовано: форма ревʼю касту (корекція в місці + агрегатна оцінка), мульти-селектор сцен із видимим списком, зоряний UI на result-блоках, стани reference-блока (превʼю/placeholder/failed+retry/no-flow/badge), діалог-warning видалення флоу, дія додавання ручного блока. | Рендер у component-обвʼязці; assert на вивід + взаємодію, без повного буту застосунку. |
| Visual-regression | Стани reference-блока на канвасі (превʼю з primary-зірки, no-preview placeholder, failed, no-flow, badge драфта) проти затвердженого еталона. | Снапшот рендеру; фейл на ненавмисному візуальному diff-і; еталон оновлюється свідомо. |
| E2E-through-UI | Три критичні user-journey через реальний рендерений UI (по одному на quality goal sad §1): J1 «каст до канвасу», J2 «зірки до сцен», J3 «лайфцикл без втрат». | Потік через реальний UI проти ефемерних залежностей; LLM/Image-провайдери — детерміновані стаби, щоб async-результат був відтворюваним. |
| Load | Числові §6 NFR, що залежать від серверного навантаження. | Інструмент навантаження, що вже в репо, або наприклад k6 / Locust. |

## AC coverage

Кожен AC §5 має ≥1 рядок. E2E-through-UI зарезервовано за трьома подорожами J1–J3; решта UI-поведінки — component + integration.

| AC (spec.md §5) | Test name (intent-based) | Level | Expected outcome |
|---|---|---|---|
| **AC-01** — happy (екстракція) | starting reference generation produces a reviewable cast proposal and charges nothing | integration + component + e2e-through-UI (J1) | Створено job екстракції; proposal показує персонажів/оточення з описами, призначеними зображеннями і запропонованими scene links — усе коректовано в місці (links — тим самим мульти-селектором); видно агрегатну кост-оцінку; жодна платна генерація не стартувала. |
| **AC-01b** — edge (повторний запуск) | cast extraction is not offered on a draft that already has reference blocks | integration + component | Дія екстракції прихована в UI і відхиляється сервером на драфті з підтвердженим кастом; каст росте лише через ручне додавання блока (US-07). |
| **AC-02** — інваріант (cast size limit) | an over-limit script proposal is truncated to the limit by scene-appearance count | unit + integration | Proposal містить ≤ 12 записів (cast size limit); лишаються записи з найбільшою кількістю сцен появи; Creator-у сказано, що решту можна додати вручну. |
| **AC-03** — happy (підтвердження → rolling window) | confirming the cast creates block+flow pairs and rolls first generations in cast order | integration + e2e-through-UI (J1) | Один блок на запис (off-chain на канвасі), кожен лінкований 1:1 з новим флоу, преднаповненим зображеннями або текстовим описом запису; перші генерації стартують у cast order, одночасно ≤ N (налаштування Creator-а, дефолт 4); коли одна завершується — стартує наступна; підтвердження покриває лише перші запуски. |
| **AC-04** — error (частковий фейл) | a failed first generation shows a per-block failed status with retry while the window continues | integration + component | Уражений блок — failed-статус, retry і причина простою мовою; інші блоки тривають; вікно підхоплює наступний pending; драфт ніколи не лишається без зрозумілого пер-блок статусу; блок без результатів рахується як без зірки, і gate-повідомлення називає його разом із діями виходу (retry або видалити блок). |
| **AC-05** — happy (відкриття флоу) | a reference block opens its linked flow in the same tab with a back-to-storyboard action | component + e2e-through-UI (J2) | Лінкований флоу відкривається в тій самій вкладці; видима дія «назад до сторіборда» повертає в цей драфт; флоу повністю редаговний, як будь-який generation flow. |
| **AC-06** — happy (зірки) | starred results become the block's candidates and the primary star becomes its canvas preview | integration + component | Усі зірковані результати — reference-кандидати блока; primary-зіркований — превʼю блока на канвасі; toggle ідемпотентний (унікальний індекс блок+файл), primary — щонайбільше один на блок (унікальний індекс). |
| **AC-07** — edge (primary знято) | removing the primary star falls back to another star or the no-preview placeholder | unit + integration | Превʼю падає на іншу зірку, якщо є; інакше placeholder і блок знову не проходить gate; те саме при видаленні всіх зірок чи всіх результатів флоу — лінк блок↔флоу лишається цілим (no-flow стан — лише для видаленого флоу, AC-12); видалення зіркованого файла синхронно чистить зірку (ADR-0009). |
| **AC-08** — інваріант (star gate) | full scene-set generation is blocked while any reference block lacks a star, naming the blocks | unit + integration | Старт повного набору сцен заблоковано сервером; повідомлення простою мовою поіменно називає блоки без зіркованого результату (включно з блоками без результатів, AC-04). |
| **AC-08b** — edge (scope gate) | regenerating scene X needs stars only from blocks linked to X; zero blocks pass the gate | unit + integration | Для сцени X перевіряються лише лінковані до X блоки (незірковані нелінковані не блокують); драфт без reference-блоків проходить gate — сцени генеруються за правилом no-linked-blocks AC-09, derived style падає на скрипт, коли зірок немає. |
| **AC-09** — cross-context (reference boundary) | the scene master uses only starred images of linked blocks and a shared derived style for unlinked scenes | unit + integration | Для сцени X кандидати — лише зірковані зображення лінкованих до X блоків (primary кожного + добір зірок до capacity моделі, ADR-0008); зображення нелінкованих блоків ніколи не потрапляють у X; сцени без лінків — prompt + одна draft-global derived style description, спільна для всіх таких сцен. |
| **AC-10** — happy (scene links) | editing a block's scene selector updates the visible list and the next generation honors it | integration + component | Додавання/зняття окремих сцен у мульти-селекторі оновлює видимий список лінкованих сцен; наступна генерація сцен поважає оновлені лінки; збереження списку — versioned (compare-and-set по версії блока). |
| **AC-10b** — edge (лайфцикл сцен) | scene deletion prunes links, a new scene gets none, reorder changes nothing | integration | Видалення сцени автоматично прибирає її з усіх списків (без dangling links); нова сцена не отримує лінків автоматично; reorder не змінює лінків — лінк привʼязаний до сцени, не до позиції. |
| **AC-11** — happy (ручний блок) | manually adding a block creates an empty linked flow with no run and no charge | integration + component | Створено порожній лінкований флоу без жодної генерації і списання; блок бере участь у gate як усі; cast size limit не діє на ручні додавання (він обмежує лише proposal екстракції); діють існуючі пер-юзер rate limits на створення. |
| **AC-12** — cross-context (flow list) | auto-created flows carry the draft badge and deleting one warns and leaves the block flow-less | integration + component | У списку Generate AI флоу позначені badge-м драфта; спроба видалення — warning, що від флоу залежить блок сторіборда; після підтвердження блок у no-flow стані (без превʼю, без кандидатів, не проходить gate до розвʼязання). |
| **AC-13** — authorization | every reference surface denies a non-owner without revealing contents | integration (виділений рядок) | Кожна дія не-власника — відкриття блоків/флоу, star/un-star, редагування лінків, підтвердження касту, видалення блока чи флоу, читання proposal — дає not-found-результат без розкриття вмісту чи факту існування. |
| **AC-14** — happy (видалення блока) | deleting a block keeps the flow and its results intact in the flow list | integration | Флоу і всі результати лишаються в списку Generate AI (badge знято); scene links блока прибрано; блок більше не бере участі в gate. |
| **AC-14b** — edge (видалення драфта) | deleting the draft leaves every linked flow and its results intact | integration | Усі лінковані флоу і їхні результати лишаються в списку зі знятим badge — те саме правило виживання, що для блока: години ітерацій не губляться з драфтом. |
| **AC-04 + AC-06/AC-07 + AC-12** — візуальні стани | reference block canvas states match the approved baseline | visual-regression | Рендер станів блока (превʼю з primary-зірки, no-preview placeholder, failed, no-flow, badge) збігається з еталоном; ненавмисний diff — фейл; еталон оновлюється свідомо. |

## Edge cases / error paths

Кожен error/authorization AC вище вже має власний рядок. Додаткові межі й фейли, що випливають зі спеки, §6.1 і sequence-флоу sad §6:

- **LLM-провайдер недоступний / фейл job-а екстракції (Flow 1, гілка помилки)** → екстракція завершується failed-статусом простою мовою з можливістю повторного запуску; нічого не списано, блоки не створені. (integration)
- **Prompt injection через текст скрипта (spec §6.1)** → скрипт трактується як дані, не як інструкції; вихід екстракції обмежений cast-схемою — adversarial-скрипт не змінює поведінку і не ламає схему proposal. (integration — фікстура з ворожим скриптом)
- **Proposal посилається на неіснуючу сцену** → невалідні scene links відсіюються валідацією до показу/збереження; жодного dangling link від народження. (integration)
- **Конкурентне збереження scene links зі застарілою версією (NFR; Flow 5)** → друге збереження відхилено як конфлікт, Creator отримує reload-prompt; перша правка лишається авторитетною — нічого не загублено мовчки. (integration)
- **Подвійний/конкурентний toggle тієї самої зірки (F1-override)** → операція комутативна й ідемпотентна: один рядок зірки, стан сходиться; без версії і без конфлікту. (integration) *Конкурентна маніпуляція primary з двох вкладок — прийнятий борг sad §11, свідомо без тесту.*
- **Повторно доставлений job першої генерації (Flow 1/черга)** → ідемпотентна обробка: без подвійного списання, без дубля результату, window_status не псується. (integration)
- **Атомарний claim rolling window (ADR-0003)** → два воркери не підхоплюють той самий pending-блок; після фейлу генерації наступний pending стартує (вікно не стопориться). (integration)
- **Дублювання драфта (ADR-0006)** → скопійовані блоки входять у no-flow стан (лінк не копіюється); оригінал неушкоджений. (integration)
- **Відновлення checkpoint-а (ADR-0006)** → лінки блок↔флоу ре-валідуються; блоки зі зниклими флоу позначаються no-flow, не падають. (integration)
- **Malformed payload (битий UUID, зайві/відсутні поля) на будь-якому reference-ендпоінті** → відхилено як bad-request до будь-якої owner- чи провайдер-роботи. (contract + integration)
- **Spam-створення блоків/флоу (spec §6.1)** → існуючі пер-юзер rate limits на створення відбивають серію запитів понад ліміт. (integration)

## Test data

- **Seed-стратегія:** фабрики-хелпери з `data-model.md` §Test fixtures — `createCastExtractionJob` (дефолт `status='completed'` з мінімальним `proposal_json`), `createReferenceBlock` (дефолт `cast_type='character'`, `window_status=null`, `version=1`), `createReferenceSceneLink`, `createReferenceStar` (`isPrimary` → `is_primary=1`, інакше `NULL`); плюс існуючі фабрики драфта/сцен/флоу/файлів сусідніх фіч.
- **PII-гард:** імена в фікстурах — лише `'Test Character'` / `'Test Environment'`, користувачі — `user-<uuid>@example.test`; жодних реальних імен/облич (uploaded reference images можуть зображати реальних осіб — у тестах лише синтетичні файли).
- **Integration-залежність:** існуюча реальна MySQL-обвʼязка репо (тести файла — послідовно в одному процесі), НЕ мокнута база — унікальні індекси зірок, FK-каскади лінків, versioned-save конфлікт і атомарний claim вікна перевіряються лише справжнім рушієм. Redis (черги/події) — справжній; LLM- та Image-провайдери стабуються на межі їхнього клієнта (детерміновані відповіді).
- **Межа очищення:** **пер-тест** — після кожного тесту засіяні рядки `storyboard_cast_extraction_jobs` / `storyboard_reference_blocks` / `storyboard_reference_scene_links` / `storyboard_reference_stars` (+ драфти/флоу/файли) прибираються, щоб тести на спільній БД лишались незалежними і сьюїт не флейкав.

## NFR validation (load)

Load-сценарій — лише там, де число §6 залежить від серверного навантаження. Решта чисел перевіряється названим способом — жодне не згублено мовчки.

- **Відкриття Video Road Map canvas з reference-блоками — p95 ≤ 1500 мс (до 50 блоків):** засіяти драфт із 50 блоками (зірки + лінки), тримати цільовий темп конкурентних відкриттів фіксовану тривалість; assert read-шлях p95 ≤ 1500 мс (вправляє `idx_storyboard_reference_blocks_draft_sort` + читання зірок/лінків). Інструмент — той, що вже в репо, або наприклад k6 / Locust.
- **Каст-екстракція p95 ≤ 60 с (старт → показ proposal):** домінує латентність LLM-провайдера — load-замір зі стабом безглуздий; верифікується продовою телеметрією async-job-ів (той самий канал, що existing storyboard planning queue). <!-- свідомо не load-сценарій -->
- **Staged auto-start — ≤ N конкурентних, повний каст підхоплено воркером ≤ 5 хв:** поведінка диспетчера черги — integration-тест rolling window (ліміт N, cast order, claim наступного) + метрики черги воркера в проді. <!-- свідомо не load-сценарій -->
- **Точність агрегатної оцінки ±10%:** коректність формули (сума пер-флоу оцінок) — unit/integration; фактичне відхилення — білінг-телеметрія в проді. <!-- свідомо не load-сценарій -->
- **Доступність 99.9%:** місячне SLO-вікно (успадковане), моніторинг — не пререлізний тест. <!-- N/A як load-сценарій: SLO, не throughput-ціль -->
- **Конкурентна безпека (зірки / scene links):** коректнісний gate — integration-рядки AC-10 + edge-кейси конфлікту версії й ідемпотентного toggle вище, не load. <!-- свідомо не load-сценарій -->

## CI placement

Порада, не конфіг пайплайна — реальну розводку володіють `implement` і CI репо.

- **На кожен PR (швидкі):** unit, contract, component, visual-regression — і integration-сьюїт API/worker (репо вже ганяє тести проти реальної MySQL послідовно в одному процесі).
- **За розкладом / pre-release (важкі):** три e2e-through-UI подорожі (J1 «каст до канвасу», J2 «зірки до сцен», J3 «лайфцикл без втрат») + load-сценарій canvas-open.
