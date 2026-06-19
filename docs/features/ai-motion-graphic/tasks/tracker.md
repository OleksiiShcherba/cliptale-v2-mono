# Tracker — ai-motion-graphic

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T1 | Promote + apply the 3 core MG tables | migration | Backend Lead | S | — | done |
| T2 | Promote + apply `storyboard_block_media` alter | migration | Backend Lead | S | T1 | done |
| T3 | Anthropic SDK dep + `APP_ANTHROPIC_API_KEY` + client | wiring | Tech Lead | S | — | done |
| T4 | Scaffold motion-graphic feature slice + route | ui | Frontend Lead | S | — | done |
| T5 | `motionGraphic.repository` (graphics + chat + snapshots) | infra | Backend Lead | M | T1, T2 | done |
| T6 | `motionGraphic.service` (ownership + ready-state) | app | Backend Lead | M | T5 | done |
| T7 | `motionGraphic.cost.service` (estimate + revalidate) | app | Backend Lead | S | — | done |
| T8 | `motionGraphicGuardrail.service` (guardrail + allowlist) | app | Security Lead | M | — | done |
| T9 | `motionGraphicAuthoring.service` (Anthropic SSE proxy) | app | Backend Lead | M | T3, T7, T8 | done |
| T10 | MG CRUD routes + controller | ports | Backend Lead | M | T6 | done |
| T11 | Generate + refine SSE endpoints | ports | Backend Lead | M | T9, T6, T10 | done |
| T12 | Attach-to-block endpoint | ports | Backend Lead | M | T5, T6 | done |
| T13 | MG list page (empty/rename/duplicate) | ui | Frontend Lead | M | T4, T10 | done |
| T14 | Browser runtime: transpile + `<Player>` mount | ui | Frontend Lead | M | T4 | done |
| T15 | Determinism AST scan + runtime shim | ui | Tech Lead | M | T14 | done |
| T16 | Authoring view: duration + generate SSE + create persist | ui | Frontend Lead | M | T11, T14, T15, T10 | done |
| T17 | Authoring view: refine SSE + append-turn persist | ui | Frontend Lead | M | T16 | done |
| T18 | Attach-to-storyboard UI | ui | Frontend Lead | M | T12, T14 | done |
| T19 | Guardrail conformance suite (red-team) | tests | Security Lead | S | T8 | done |
| T20 | CI frame-diff parity + determinism E2E | tests | Tech Lead | M | T15 | done |

**Total:** 20 tasks, ~24 person-days (S≈0.5d, M≈1.5d).
