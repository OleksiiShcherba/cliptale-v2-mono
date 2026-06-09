# Tracker — scene-generation-reference-gate

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T1 | Readiness reads (Q1–Q3) у reference-репозиторіях | infra | Oleksii | M | — | todo |
| T2 | ReferenceNotReadyError замість StarGateFailedError | domain | Oleksii | S | — | todo |
| T3 | Full-draft Reference-done gate у сервісі | app | Oleksii | M | T1, T2 | todo |
| T4 | Scene-scoped gate для per-scene регенерації | app | Oleksii | S | T3 | todo |
| T5 | Зняти principal image зі scene-шляху (app) | app | Oleksii | M | T4 | todo |
| T6 | Видалити principal-endpoints + оновити contract package | ports | Oleksii | M | T5 | todo |
| T7 | Один selected output на блок у worker-selection | domain | Oleksii | M | — | todo |
| T8 | Прибрати principal-read зі scene-джоби | infra | Oleksii | S | T7 | todo |
| T9 | Зняти principal-крок зі storyboard SPA | ui | Oleksii | M | T6 | todo |
| T10 | Рендер відмови Reference-done gate | ui | Oleksii | M | T9 | todo |
| T11 | API-інтеграційні тести гейта (live MySQL) | tests | Oleksii | M | T6 | todo |
| T12 | Worker-тести boundary-інваріанта + selection | tests | Oleksii | M | T8 | todo |
| T13 | Playwright e2e гейта через UI | tests | Oleksii | M | T10, T12 | todo |
| T14 | Закрити OQ-2/OQ-3 + задокументувати known limitations | docs | Oleksii | S | T11, T12, T13 | todo |

**Total:** 14 tasks, ~11 person-days.
