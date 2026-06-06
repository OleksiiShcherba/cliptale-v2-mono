---
status: Accepted
owner: "Tech Lead (Oleksii)"
reviewers: ["Tech Lead"]
updated_at: "2026-06-06"
feature_size: "L"
ticket: ""
---

# 0001 — Target the backend-service, web-frontend and worker surfaces

- **Status:** Accepted
- **Date:** 2026-06-06
- **Deciders:** Tech Lead (Oleksii) + design Socratic walk

## Context

Фіча storyboard-reference-flows охоплює каст-екстракцію, reference-блоки на storyboard-канвасі, зірки в generation flows і star gate для генерації сцен. Треба зафіксувати, які C4-контейнери фіча вводить або суттєво розширює — цей вибір гейтить §5 SAD, шари задач у tasks, рівні тестів у plan-tests і форму API-контракту.

## Decision drivers

- Spec §4: користувацькі сторії покривають і канвас (UI), і backend-правила (star gate, reference boundary), і async-генерацію (rolling window, екстракція).
- NFR «екстракція p95 ≤ 60 с» + «повний каст підхоплений ≤ 5 хв» — вимагають воркерної поверхні (async job telemetry, worker queue metrics).
- §2 Constraints: нуль нової інфри — усі поверхні живуть в існуючих контейнерах (`apps/api`, `apps/web-editor`, `apps/media-worker`).

## Considered options

1. **[backend-service, web-frontend, worker]** — три поверхні, воркерна логіка явна.
2. **[backend-service, web-frontend]** — воркерна логіка «розчиняється» в backend-задачах; sequences не малює async-гілки явно.

## Decision outcome

**Chosen:** Option 1. Фіча вводить новий тип джоби (каст-екстракція), completion-hook rolling window і розширення scene generation master — це самостійна воркерна поверхня з власними async-флоу та worker-задачами; ховати її в backend-шарі означає втратити явні async-діаграми та worker-рівневі тести.

## Consequences

**Positive**
- sequences малює async-флоу явно (екстракція, rolling window, генерація сцен).
- tasks отримує ui-шар + worker-шар; plan-tests — component / e2e-through-UI рівні для web.

**Negative**
- Більший обсяг артефактів (кожна поверхня додає свої флоу, задачі, тести) — фіча й так L.

**Neutral**
- Усі три поверхні — розширення існуючих контейнерів, не нові деплой-юніти.

## Links

- Spec: [[../spec.md]] §4
- SAD: [[../sad.md]] §4 (D4.1), frontmatter `target_surfaces`
