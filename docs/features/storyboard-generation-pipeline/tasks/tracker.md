# Tracker — storyboard-generation-pipeline

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T1 | Create the storyboard_pipeline state table (staged migration) | migration | Tech Lead | S | — | done |
| T2 | Build the shared pipeline transition module (pure) | domain | Backend | M | — | done |
| T3 | storyboard_pipeline repository (row + CAS + stuck query) | infra | Backend | M | T1, T2 | done |
| T4 | Resume read: auto-start + lazy stuck-release | app | Backend | M | T3 | done |
| T5 | Server-side cost estimate compute + re-validate | app | Backend | M | T3 | done |
| T6 | Confirm-cast: references below music, idempotent | app | Backend | M | T4, T5 | done |
| T7 | Trigger phase: guards + incremental re-trigger | app | Backend | M | T4 | done |
| T8 | Cancel + skip use cases | app | Backend | S | T4 | done |
| T9 | Pipeline routes + controller (authz-first, error codes) | ports | Backend | M | T6, T7, T8 | done |
| T10 | Worker completion-hooks advance phases | infra | Backend | M | T2, T3 | done |
| T11 | Reaper repeatable: release stuck phases | infra | Backend | S | T3 | done |
| T12 | Scene-image: refs feed scenes + text-only fallback | infra | Backend | M | T10 | done |
| T13 | Instrument actual cost + estimate-vs-actual delta | infra | Backend | S | T10, T5 | done |
| T14 | Wire realtime publish + mount routes + register reaper | wiring | Backend | S | T9, T11 | done |
| T15 | usePipelineState hook + retire client orchestration | ui | Frontend | M | T9 | done |
| T16 | BlockingLoader component | ui | Frontend | S | T15 | done |
| T17 | ReviewCastProposalModal (reuse CastConfirmModal) | ui | Frontend | M | T15 | done |
| T18 | SceneImageOfferModal | ui | Frontend | S | T15 | done |
| T19 | StepCorners corner controls + guard messages | ui | Frontend | M | T15 | done |
| T20 | End-to-end + resume/authz regression coverage | tests | Backend + Frontend | M | T14, T16, T17, T18, T19, T12, T13 | todo |
| T21 | Deploy cut-over: migrate in-flight old-flow drafts (OQ-2) | docs | Tech Lead | M | T9 | todo |

**Total:** 21 tasks, ~18.5 person-days.
