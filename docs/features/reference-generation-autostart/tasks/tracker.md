# Tracker — reference-generation-autostart

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T1 | Make `startExtraction` idempotent per draft + widen status union | app | Oleksii (Storyboard squad) | M | — | done |
| T2 | Backend integration test — idempotent start (QG-3) | tests | Oleksii (Storyboard squad) | S | T1 | done |
| T3 | Refactor `CastConfirmModal` into a backdrop+dialog wrapper | ui | Oleksii (Storyboard squad) | M | — | done |
| T4 | Modal states — in-progress / proposal-ready / completed-empty | ui | Oleksii (Storyboard squad) | S | T3 | done |
| T5 | New `useCastAutostart(draftId)` hook + widen client return type | ui | Oleksii (Storyboard squad) | M | — | done |
| T6 | Wire `useCastAutostart` + manual control into `StoryboardPage` | wiring | Oleksii (Storyboard squad) | M | T4, T5 | done |
| T7 | Frontend UI regression — no stray buttons, no duplicate, consent preserved | tests | Oleksii (Storyboard squad) | S | T6 | done |

**Total:** 7 tasks, ~6 person-days.
