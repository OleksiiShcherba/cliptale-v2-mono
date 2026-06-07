# Tracker — storyboard-reference-flows

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T1 | Promote staged curation migrations 01–04 | migration | Oleksii | S | — | done |
| T2 | Extraction-job + reference-block repositories | infra | Oleksii | M | T1 | done |
| T3 | Stars + scene-links repositories | infra | Oleksii | M | T1 | done |
| T4 | Cast-extraction service (start/get, guard, authz) | app | Oleksii | M | T2 | done |
| T5 | Worker cast-extract job (LLM, Zod, limit 12) | app | Oleksii | M | T2 | done |
| T6 | Confirm-cast service + rolling-window dispatch | app | Oleksii | L | T2, T3 | done |
| T7 | Rolling-window completion-hook | app | Oleksii | M | T2 | done |
| T8 | Block lifecycle + versioned scene-link save | app | Oleksii | L | T2, T3 | todo |
| T9 | Star service (toggle, primary, fallback, cleanup) | app | Oleksii | M | T2, T3 | todo |
| T10 | Star gate в illustration service | app | Oleksii | M | T2, T3 | todo |
| T11 | Scene master: reference boundary + style description | app | Oleksii | L | T2, T3 | todo |
| T12 | Badge + delete-warning + duplication/restore semantics | app | Oleksii | M | T2 | todo |
| T13 | Ports: extraction + confirm endpoints | ports | Oleksii | M | T4, T6 | todo |
| T14 | Ports: blocks/retry/links/stars endpoints | ports | Oleksii | M | T8, T9, T13 | todo |
| T15 | UI: ReferenceBlockNode на канвасі | ui | Oleksii | L | T14 | todo |
| T16 | UI: SceneLinkSelector + 409 reload prompt | ui | Oleksii | M | T14 | todo |
| T17 | UI: cast confirmation modal + заміна principal-image | ui | Oleksii | L | T13, T16 | todo |
| T18 | UI: зірки на ResultNode | ui | Oleksii | M | T14 | todo |
| T19 | UI: draft badge + delete warning + back-nav | ui | Oleksii | M | T12 | todo |
| T20 | UI: gate message + concurrency setting | ui | Oleksii | S | T6, T10 | todo |
| T21 | E2E: повна журні extract→confirm→stars→gate→scenes | tests | Oleksii | M | T5, T7, T11, T15, T16, T17, T18, T19, T20 | todo |

**Total:** 21 tasks, ~22 person-days (S=0.5 · M=1 · L=1.5).
