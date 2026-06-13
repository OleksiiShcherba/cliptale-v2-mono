# Tracker — storyboard-generation-pipeline

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T1 | Create the storyboard_pipeline state table (staged migration) | migration | Tech Lead | S | — | todo |
| T2 | Build the shared pipeline transition module (pure) | domain | Backend | M | — | todo |
| T3 | storyboard_pipeline repository (row + CAS + stuck query) | infra | Backend | M | T1, T2 | todo |
| T4 | Resume read: auto-start + lazy stuck-release | app | Backend | M | T3 | todo |
| T5 | Server-side cost estimate compute + re-validate | app | Backend | M | T3 | todo |
| T6 | Confirm-cast: references below music, idempotent | app | Backend | M | T4, T5 | todo |
| T7 | Trigger phase: guards + incremental re-trigger | app | Backend | M | T4 | todo |
| T8 | Cancel + skip use cases | app | Backend | S | T4 | todo |
| T9 | Pipeline routes + controller (authz-first, error codes) | ports | Backend | M | T6, T7, T8 | todo |
| T10 | Worker completion-hooks advance phases | infra | Backend | M | T2, T3 | todo |
| T11 | Reaper repeatable: release stuck phases | infra | Backend | S | T3 | todo |
| T12 | Scene-image: refs feed scenes + text-only fallback | infra | Backend | M | T10 | todo |
| T13 | Instrument actual cost + estimate-vs-actual delta | infra | Backend | S | T10, T5 | todo |
| T14 | Wire realtime publish + mount routes + register reaper | wiring | Backend | S | T9, T11 | todo |
| T15 | usePipelineState hook + retire client orchestration | ui | Frontend | M | T9 | todo |
| T16 | BlockingLoader component | ui | Frontend | S | T15 | todo |
| T17 | ReviewCastProposalModal (reuse CastConfirmModal) | ui | Frontend | M | T15 | todo |
| T18 | SceneImageOfferModal | ui | Frontend | S | T15 | todo |
| T19 | StepCorners corner controls + guard messages | ui | Frontend | M | T15 | todo |
| T20 | End-to-end + resume/authz regression coverage | tests | Backend + Frontend | M | T14, T16, T17, T18, T19, T12, T13 | todo |
| T21 | Deploy cut-over: migrate in-flight old-flow drafts (OQ-2) | docs | Tech Lead | M | T9 | todo |

**Total:** 21 tasks, ~18.5 person-days.
