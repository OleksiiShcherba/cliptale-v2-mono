# Tracker — storyboard-autosave-checkpoints

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T1 | Staged-міграція user_settings | migration | Oleksii (solo dev) | S | — | done |
| T2 | Staged-міграція origin + preview_kind | migration | Oleksii (solo dev) | S | — | done |
| T3 | Settings repository + service | infra | Oleksii (solo dev) | S | T1 | done |
| T4 | Settings endpoints GET/PUT /users/me/settings | ports | Oleksii (solo dev) | M | T3 | done |
| T5 | Checkpoint push: POST history + origin/previewKind | ports | Oleksii (solo dev) | M | T2 | done |
| T6 | History list: фільтр origin=checkpoint | ports | Oleksii (solo dev) | S | T2 | done |
| T7 | captureCanvasThumbnail: 5-с таймаут + фолбек | ui | Oleksii (solo dev) | S | — | done |
| T8 | Settings-сторінка + роут + пункт меню | ui | Oleksii (solo dev) | M | — | done |
| T9 | Checkpoint push client (rework useStoryboardHistoryPush) | ui | Oleksii (solo dev) | M | T7 | done |
| T10 | useCheckpointScheduler | ui | Oleksii (solo dev) | L | T8, T9 | done |
| T11 | CheckpointCountdownBar + CaptureOverlay | ui | Oleksii (solo dev) | M | T10 | done |
| T12 | History-панель: previewKind + pre-restore checkpoint | ui | Oleksii (solo dev) | M | T9 | todo |
| T13 | Autosave: індикатор «не збережено» + авторетрай | ui | Oleksii (solo dev) | M | — | done |
| T14 | Wiring StoryboardPage: two-tier save | wiring | Oleksii (solo dev) | M | T10, T11, T12, T13 | todo |
| T15 | E2E: checkpoint-потоки + slow-capture | tests | Oleksii (solo dev) | L | T4, T5, T6, T14 | todo |
| T16 | KPI-1 базлайн history-записів | docs | Oleksii (solo dev) | S | — | todo |

**Total:** 16 tasks, ~10–11 person-days (S≈0.25–0.5 d, M≈0.5–1 d, L≈1 d).
