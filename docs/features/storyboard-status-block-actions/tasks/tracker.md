# Tracker — storyboard-status-block-actions

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T1 | Build StoryboardStatusMenu component | ui | Frontend Eng | M | — | done |
| T2 | Build StoryboardRegenerateConfirmModal | ui | Frontend Eng | M | — | done |
| T3 | Visual consistency + drop "Ref" box | ui | Frontend Eng | S | — | done |
| T4 | Mount menu on completed state of both blocks | ui | Frontend Eng | S | T1, T3 | done |
| T5 | useStoryboardHiddenBlocks hook | ui | Frontend Eng | M | — | done |
| T6 | Wire menu/modal/hide/owner gate + Regenerate dispatch | wiring | Frontend Eng | M | T2, T4, T5 | done |
| T7 | Component + integration tests | tests | Frontend Eng | M | T6 | done |
| T8 | E2E + accessibility checks | tests | Frontend Eng | M | T6 | done |

**Total:** 8 tasks, ~5–6 person-days.
